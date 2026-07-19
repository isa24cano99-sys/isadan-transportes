'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

// ── Parseo del Excel Flypass (mismos helpers que ImportarClient, en el servidor) ──

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

type TollRow = {
  status: string; type: string; document: string; plate: string; toll_name: string
  category: string; pass_date: string | null; subtotal: number; tax: number; total: number
  cufe: string; nit: string
}

function mapFlypass(raw: Record<string, unknown>): TollRow {
  // Soporta el reporte "movimientos" (Fecha/Valor/Documento contable/Tipo de movimiento)
  // y el reporte antiguo (F.Paso/Total/Documento) como fallback.
  const dateRaw = raw['Fecha'] ?? raw['F.Paso'] ?? raw['F. Paso'] ?? raw['f.paso'] ?? raw['F.PASO']
  // En el reporte "movimientos" el Valor viene firmado: negativo = cobro (gasto),
  // positivo = ajuste/reversa. Lo invertimos para que costo sea positivo y la reversa
  // negativa; así la suma por placa+día da el neto real. El formato antiguo usa "Total" (positivo).
  const rawNorm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) rawNorm[norm(k)] = v
  const tieneValor = norm('Valor') in rawNorm
  const total = tieneValor ? -getNum(raw, 'Valor') : getNum(raw, 'Total')
  return {
    status:    getCol(raw, 'Estado'),
    type:      getCol(raw, 'Tipo de movimiento', 'Tipo'),
    document:  getCol(raw, 'Documento contable', 'Documento'),
    plate:     getCol(raw, 'Placa'),
    toll_name: getCol(raw, 'Peaje'),
    category:  getCol(raw, 'Categoria', 'Categoría'),
    pass_date: parseFlypassDate(dateRaw),
    subtotal:  0,
    tax:       0,
    total,
    cufe:      getCol(raw, 'CUFE', 'Cufe'),
    nit:       getCol(raw, 'NIT', 'Nit'),
  }
}

const PEAJE_PUC = '61450575' // 'Peajes operación'

export type GrupoPeaje = {
  plate:  string
  fecha:  string   // YYYY-MM-DD
  count:  number   // cantidad de peajes de esa placa ese día
  total:  number
  estado: 'creado' | 'omitido' | 'fuera-de-rango'
}

export type FlypassResult = {
  ok: boolean
  error?: string
  grouped: GrupoPeaje[]
  // Resumen de lo importado
  totalPeajes: number
  totalCOP: number
  periodoInicio: string | null
  periodoFin: string | null
  // Persistencia en toll_transactions
  tollsInserted: number
  tollDuplicates: number
  // Transacciones creadas en bancos
  bankCreated: number
  bankSkipped: number
  accountName?: string
}

const emptyResult = (extra: Partial<FlypassResult>): FlypassResult => ({
  ok: false, grouped: [], totalPeajes: 0, totalCOP: 0, periodoInicio: null, periodoFin: null,
  tollsInserted: 0, tollDuplicates: 0, bankCreated: 0, bankSkipped: 0, ...extra,
})

/**
 * Sube el reporte Flypass, guarda los peajes en `toll_transactions` (dedup por
 * `document`) y registra un egreso en `bank_transactions` por cada placa+día
 * con fecha ≥ `fechaInicio`, sin duplicar (dedup por `source` + `description`).
 */
export async function importarFlypassPeajesAction(
  file: File,
  fechaInicio: string,
): Promise<FlypassResult> {
  if (!file || file.size === 0) return emptyResult({ error: 'No se adjuntó archivo.' })
  if (!fechaInicio) return emptyResult({ error: 'Selecciona la fecha "Registrar en bancos desde".' })

  // 1. Parsear
  let rows: TollRow[]
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
    // Solo movimientos de peaje (COBRO/AJUSTE PEAJE). Excluye RECARGA, PARQUEADERO, etc.
    // Si no hay columna "Tipo de movimiento" (formato antiguo), se aceptan todas.
    rows = json.map(mapFlypass).filter(r => r.plate && (!r.type || /peaje/i.test(r.type)))
  } catch (e: any) {
    console.error('[importarFlypassPeajes] error leyendo Excel:', e.message)
    return emptyResult({ error: `No se pudo leer el Excel: ${e.message}` })
  }

  if (rows.length === 0) return emptyResult({ ok: true })

  // 2. Guardar en toll_transactions (dedup por document)
  let tollsInserted = 0, tollDuplicates = 0
  const docs = rows.map(r => r.document).filter(d => d.length > 0)
  let existingDocs = new Set<string>()
  if (docs.length > 0) {
    const { data: existing } = await supabase.from('toll_transactions').select('document').in('document', docs)
    existingDocs = new Set((existing ?? []).map(e => e.document as string))
  }
  const newTolls = rows.filter(r => r.document && !existingDocs.has(r.document))
  if (newTolls.length > 0) {
    const { error: tollErr } = await supabase.from('toll_transactions').insert(newTolls)
    if (tollErr) {
      console.error('[importarFlypassPeajes] error guardando toll_transactions:', tollErr.message)
      return emptyResult({ error: `Error guardando peajes: ${tollErr.message}` })
    }
  }
  tollsInserted  = newTolls.length
  tollDuplicates = rows.length - newTolls.length

  // 3. Agrupar por placa + día (solo filas con fecha válida)
  const groups = new Map<string, { plate: string; fecha: string; total: number; count: number }>()
  for (const r of rows) {
    if (!r.pass_date) continue
    const fecha = r.pass_date.slice(0, 10)
    const plate = r.plate.trim().toUpperCase().replace(/\s+/g, '')
    const key = `${plate}_${fecha}`
    const g = groups.get(key) ?? { plate, fecha, total: 0, count: 0 }
    g.total += Number(r.total ?? 0)   // costo positivo, reversa negativa → neto real
    g.count += 1
    groups.set(key, g)
  }
  const allGroups = Array.from(groups.values())
    // Descartar grupos con neto ≈ 0 o negativo (cobros totalmente revertidos)
    .map(g => ({ ...g, total: Math.round(g.total) }))
    .filter(g => g.total >= 1)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.plate.localeCompare(b.plate))

  // Resumen de lo importado (neto positivo de todos los peajes agrupados)
  const totalCOP    = allGroups.reduce((s, g) => s + g.total, 0)
  const fechasValidas = allGroups.map(g => g.fecha)
  const periodoInicio = fechasValidas.length ? fechasValidas[0] : null
  const periodoFin    = fechasValidas.length ? fechasValidas[fechasValidas.length - 1] : null

  // 4. Resolver cuenta destino y categoría
  const { data: accounts } = await supabase.from('bank_accounts').select('id, bank_name').order('bank_name')
  if (!accounts || accounts.length === 0) {
    return emptyResult({ error: 'No hay cuentas bancarias configuradas.' })
  }
  const account =
    accounts.find(a => /bancolombia/i.test(a.bank_name ?? '') && /ahorro/i.test(a.bank_name ?? '')) ??
    accounts.find(a => /ahorro/i.test(a.bank_name ?? '')) ??
    accounts[0]

  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', PEAJE_PUC).maybeSingle()
  const categoryId = cat?.id ?? null

  // 5. Registrar egresos para placa+día ≥ fechaInicio.
  //    Dedup por `description` (determinística) porque reference_id es uuid.
  const descOf  = (g: { plate: string; fecha: string }) => `Peajes Flypass ${g.plate} ${g.fecha}`
  const enRango = allGroups.filter(g => g.fecha >= fechaInicio)
  const descs   = enRango.map(descOf)

  let existingRefs = new Set<string>()
  if (descs.length > 0) {
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('description')
      .eq('source', 'EXTRACTO_FLYPASS')
      .in('description', descs)
    existingRefs = new Set((existing ?? []).map(e => e.description as string))
  }

  const toInsert = enRango
    .filter(g => !existingRefs.has(descOf(g)))
    .map(g => ({
      account_id:     account.id,
      date:           g.fecha,
      description:    descOf(g),
      amount:         g.total,
      type:           'EGRESO',
      category:       PEAJE_PUC,
      category_id:    categoryId,
      source:         'EXTRACTO_FLYPASS',
      reference_type: 'FLYPASS_PEAJE',
    }))

  let bankCreated = 0
  if (toInsert.length > 0) {
    const { error: bankErr } = await supabase.from('bank_transactions').insert(toInsert)
    if (bankErr) {
      console.error('[importarFlypassPeajes] error creando egresos:', bankErr.message)
      return { ...emptyResult({ error: `Peajes guardados, pero error al registrar en bancos: ${bankErr.message}` }), tollsInserted, tollDuplicates }
    }
    bankCreated = toInsert.length
  }
  const bankSkipped = enRango.length - bankCreated

  // 6. Armar la tabla agrupada con estado por fila
  const grouped: GrupoPeaje[] = allGroups.map(g => {
    if (g.fecha < fechaInicio) return { ...g, estado: 'fuera-de-rango' as const }
    return { ...g, estado: existingRefs.has(descOf(g)) ? ('omitido' as const) : ('creado' as const) }
  })

  revalidatePath('/facturas')
  return {
    ok: true,
    grouped,
    totalPeajes: rows.length,
    totalCOP,
    periodoInicio,
    periodoFin,
    tollsInserted,
    tollDuplicates,
    bankCreated,
    bankSkipped,
    accountName: account.bank_name ?? undefined,
  }
}
