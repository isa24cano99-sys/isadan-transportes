'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

// ── Parseo del Excel Flypass ("Reporte movimientos") ──────────────────────────

function norm(s: string) { return s.trim().normalize('NFC') }

function getCol(row: Record<string, unknown>, ...names: string[]): string {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v !== undefined && v !== null && v !== '') return String(v).trim()
  }
  return ''
}

function getNum(row: Record<string, unknown>, ...names: string[]): number {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') return isNaN(v) ? 0 : v
    const parsed = parseFloat(String(v).trim().replace(/[$\s.]/g, '').replace(',', '.'))
    if (!isNaN(parsed)) return parsed
  }
  return 0
}

/** 'DD/MM/YYYY HH:mm[:ss]' o Date → ISO 'YYYY-MM-DDTHH:mm[:ss]'. */
function parseFlypassDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString()
  const s = String(val).trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`
  return s || null
}

/** El campo Descripcion trae "… Referencia 2: <id> - Descripción: <peaje> - Fecha …". */
function extractRef2(desc: string): string {
  const m = desc.match(/Referencia\s*2:\s*([^-]+?)\s*-/i)
  return m ? m[1].trim() : ''
}
function extractTollName(desc: string): string {
  const m = desc.match(/Descripci[oó]n:\s*(.+?)\s*-\s*Fecha/i)
  return m ? m[1].trim() : ''
}

type TollRow = {
  status: string; type: string; document: string; plate: string; toll_name: string
  category: string; pass_date: string | null; subtotal: number; tax: number; total: number
  cufe: string; nit: string
}

function mapFlypass(raw: Record<string, unknown>): TollRow {
  // Soporta el reporte "movimientos" (Fecha/Valor/Descripcion/Tipo de movimiento)
  // y el reporte antiguo (F.Paso/Total/Peaje/Documento) como fallback.
  const dateRaw = raw['Fecha'] ?? raw['F.Paso'] ?? raw['F. Paso'] ?? raw['f.paso'] ?? raw['F.PASO']
  const desc = getCol(raw, 'Descripcion', 'Descripción')
  // El Valor viene firmado: negativo = cobro (gasto), positivo = ajuste/reversa.
  // Lo invertimos para que costo sea positivo y la reversa negativa → suma da el neto real.
  const rawNorm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) rawNorm[norm(k)] = v
  const tieneValor = norm('Valor') in rawNorm
  const total = tieneValor ? -getNum(raw, 'Valor') : getNum(raw, 'Total')
  const ref2 = extractRef2(desc)
  return {
    status:    getCol(raw, 'Estado'),
    type:      getCol(raw, 'Tipo de movimiento', 'Tipo'),
    // Referencia 2 = id único del movimiento (dedup robusto entre meses y re-subidas).
    // Fallback: Documento contable / Documento (formato antiguo).
    document:  ref2 || getCol(raw, 'Documento contable', 'Documento'),
    plate:     getCol(raw, 'Placa'),
    toll_name: getCol(raw, 'Peaje') || extractTollName(desc),
    category:  getCol(raw, 'Categoria', 'Categoría'),
    pass_date: parseFlypassDate(dateRaw),
    subtotal:  0,
    tax:       0,
    total,
    cufe:      getCol(raw, 'CUFE', 'Cufe'),
    nit:       getCol(raw, 'NIT', 'Nit'),
  }
}

export type FlypassImportResult = {
  ok: boolean
  error?: string
  totalRows: number       // filas de peaje leídas del archivo
  inserted: number        // nuevas guardadas en toll_transactions
  duplicates: number      // ya existentes (dedup por Referencia 2)
  periodoInicio: string | null
  periodoFin: string | null
}

/**
 * Sube el reporte Flypass del mes y guarda los peajes en `toll_transactions`,
 * deduplicando por `document` (= Referencia 2, único por movimiento). Re-subir el
 * mismo mes no inserta duplicados. NO crea transacciones en bancos: los débitos
 * bancarios de Flypass se registran aparte desde el extracto.
 */
export async function importarFlypassAction(file: File): Promise<FlypassImportResult> {
  const empty = (extra: Partial<FlypassImportResult>): FlypassImportResult => ({
    ok: false, totalRows: 0, inserted: 0, duplicates: 0, periodoInicio: null, periodoFin: null, ...extra,
  })
  if (!file || file.size === 0) return empty({ error: 'No se adjuntó archivo.' })

  // 1. Parsear (solo movimientos de peaje: COBRO/AJUSTE PEAJE; excluye RECARGA/PARQUEADERO)
  let rows: TollRow[]
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
    rows = json.map(mapFlypass).filter(r => r.plate && (!r.type || /peaje/i.test(r.type)))
  } catch (e: any) {
    console.error('[importarFlypass] error leyendo Excel:', e.message)
    return empty({ error: `No se pudo leer el Excel: ${e.message}` })
  }

  if (rows.length === 0) {
    return empty({ ok: true, error: 'El archivo no contenía movimientos de peaje.' })
  }

  // 2. Dedup por document (Referencia 2) contra lo ya guardado
  const docs = rows.map(r => r.document).filter(d => d.length > 0)
  let existingDocs = new Set<string>()
  for (let i = 0; i < docs.length; i += 300) {
    const chunk = docs.slice(i, i + 300)
    const { data } = await supabase.from('toll_transactions').select('document').in('document', chunk)
    for (const e of data ?? []) existingDocs.add(e.document as string)
  }
  const newTolls = rows.filter(r => r.document && !existingDocs.has(r.document))

  if (newTolls.length > 0) {
    for (let i = 0; i < newTolls.length; i += 500) {
      const batch = newTolls.slice(i, i + 500)
      const { error } = await supabase.from('toll_transactions').insert(batch)
      if (error) {
        console.error('[importarFlypass] error guardando toll_transactions:', error.message)
        return empty({ error: `Error guardando peajes: ${error.message}` })
      }
    }
  }

  const fechas = rows.map(r => r.pass_date).filter(Boolean).map(d => (d as string).slice(0, 10)).sort()

  revalidatePath('/facturas/peajes')
  return {
    ok: true,
    totalRows: rows.length,
    inserted: newTolls.length,
    duplicates: rows.length - newTolls.length,
    periodoInicio: fechas[0] ?? null,
    periodoFin:    fechas[fechas.length - 1] ?? null,
  }
}
