'use server'

/*
⚠ HISTÓRICO — la fuente de verdad del esquema es supabase/migrations/ (ver README → Migraciones).
   Se conserva solo como referencia; NO ejecutar a mano.

Si falta alguna columna, ejecuta este SQL en Supabase antes de sincronizar:

alter table invoices add column if not exists dataico_id text unique;
alter table invoices add column if not exists dian_status text;
alter table invoices add column if not exists pdf_url text;
alter table invoices add column if not exists xml_url text;

-- Normalizar invoice_number SIN guion (correr ANTES de crear el índice único):
update invoices set invoice_number = replace(invoice_number, '-', '') where invoice_number like 'FEIT-%';
update trips    set dataico_invoice_id = replace(dataico_invoice_id, '-', '') where dataico_invoice_id like 'FEIT-%';

-- Para importarLibroDiarioDataicoAction (upsert por invoice_number).
-- OJO: Postgres NO soporta "add constraint if not exists"; usar un índice único idempotente,
-- que también sirve como target de ON CONFLICT (invoice_number):
create unique index if not exists invoices_invoice_number_key on invoices (invoice_number);

-- invoice_type es un ENUM (public.invoice_type) con valores EMITIDA/RECIBIDA.
-- El importador del Libro Diario guarda las notas crédito como 'NOTA_CREDITO' → hay que
-- agregar ese valor al enum ANTES de importar:
alter type public.invoice_type add value if not exists 'NOTA_CREDITO';
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { parseDateicoDate } from '@/lib/dataico'

// ── Importación desde el "Libro Diario" de Dataico ─────────────────────────────
// Nota: Dataico NO tiene endpoint de listado de facturas por API. El export de
// "Libro Diario Contabilidad" es la vía para sincronizar facturas + notas crédito.
// Estructura: título (fila 1), rango fechas (2), empresa (3), header (4):
//   Fecha | No. Comp | Doc Ref | Categoria | Tercero | Valor
// Solo procesamos dos categorías: "FEIT | Factura" y "NC | Nota Crédito".

type LibroDiarioResult = {
  ok: boolean
  facturas: number            // EMITIDA insertadas/actualizadas
  facturasNuevas: number
  facturasActualizadas: number
  notasCredito: number        // NOTA_CREDITO importadas
  ignoradas: number           // filas de otras categorías
  error?: string
}

/** Convierte un valor de celda a número (tolera comas de miles y strings). */
function toNumber(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  return parseFloat(String(v).replace(/,/g, '').trim()) || 0
}

/** Fecha de celda → 'YYYY-MM-DD'. Acepta Date (cellDates) o string 'DD/MM/YYYY HH:mm:ss'. */
function excelDateToIso(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().split('T')[0]
  }
  return parseDateicoDate(String(v ?? ''))
}

/** 'EL LLANO DC S.A.S. (901680258)' → 'EL LLANO DC S.A.S.' (quita el NIT entre paréntesis final). */
function cleanClientName(v: unknown): string {
  return String(v ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** 'TRANSPORTES JAMAR S.A.S (900793588)' → '900793588' (NIT entre paréntesis final). */
function extractNit(v: unknown): string | null {
  const m = String(v ?? '').match(/\(([^)]*)\)\s*$/)
  return m ? m[1].trim() || null : null
}

/**
 * Importa el "Libro Diario Contabilidad" de Dataico. Header en la fila 4:
 *   Fecha | No. Comp | Doc Ref | Categoria | Tercero | Valor
 *
 * Solo procesa dos categorías, ignora el resto:
 *  · "FEIT | Factura"       → invoices EMITIDA (upsert por invoice_number, preserva trip_id)
 *  · "NC | Nota Crédito"    → invoices NOTA_CREDITO (Valor NEGATIVO, dian_status ANULADA)
 *
 * Antes de insertar elimina TODAS las NOTA_CREDITO y las reconstruye desde el archivo.
 */
export async function importarLibroDiarioDataicoAction(file: File): Promise<LibroDiarioResult> {
  const empty = { ok: false, facturas: 0, facturasNuevas: 0, facturasActualizadas: 0, notasCredito: 0, ignoradas: 0 }
  if (!file || file.size === 0) {
    return { ...empty, error: 'No se adjuntó archivo.' }
  }

  let matrix: any[][]
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][]
  } catch (e: any) {
    console.error('[libroDiario] error leyendo el Excel:', e.message)
    return { ...empty, error: `No se pudo leer el Excel: ${e.message}` }
  }

  // Localizar el header (fila cuyo primer campo es "Fecha") — tolera filas extra arriba.
  const headerIdx = matrix.findIndex(r => String(r?.[0] ?? '').trim().toLowerCase() === 'fecha')
  if (headerIdx === -1) {
    return { ...empty, error: 'No se encontró el encabezado (Fecha | No. Comp | Doc Ref | Categoria | Tercero | Valor). ¿Es el Libro Diario de Dataico?' }
  }

  // Columnas por índice: 0=Fecha, 1=No.Comp, 2=Doc Ref, 3=Categoria, 4=Tercero, 5=Valor
  const emitidas: Record<string, any>[] = []
  const notas:    Record<string, any>[] = []
  let ignoradas = 0

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row || row.every(c => String(c).trim() === '')) continue

    const fecha    = row[0]
    const docRef   = String(row[2] ?? '').trim()
    const categoria = String(row[3] ?? '').trim()
    const tercero  = row[4]
    const valor    = toNumber(row[5])

    const esFactura = /FEIT/i.test(categoria) || /\bFactura\b/i.test(categoria)
    const esNota    = /\bNC\b/i.test(categoria) || /Nota\s*Cr[eé]dito/i.test(categoria)

    if (esFactura) {
      // Doc Ref: 'Factura FEIT22' → 'FEIT22'
      const m = docRef.match(/FEIT\s*-?\s*(\d+)/i)
      if (!m) { ignoradas++; continue }
      emitidas.push({
        invoice_number: `FEIT${m[1]}`,
        issue_date:     excelDateToIso(fecha),
        client_name:    cleanClientName(tercero),
        client_nit:     extractNit(tercero),
        total_amount:   valor,
        invoice_type:   'EMITIDA',
      })
    } else if (esNota) {
      // Doc Ref: 'Nota Crédito NC3' → 'NC3'
      const m = docRef.match(/NC\s*-?\s*(\d+)/i)
      if (!m) { ignoradas++; continue }
      notas.push({
        invoice_number: `NC${m[1]}`,
        issue_date:     excelDateToIso(fecha),
        client_name:    cleanClientName(tercero),
        client_nit:     extractNit(tercero),
        total_amount:   -Math.abs(valor),   // las notas crédito restan
        invoice_type:   'NOTA_CREDITO',
        dian_status:    'ANULADA',
      })
    } else {
      ignoradas++
    }
  }

  console.log(`[libroDiario] EMITIDA: ${emitidas.length} · NOTA_CREDITO: ${notas.length} · ignoradas: ${ignoradas}`)

  if (emitidas.length === 0 && notas.length === 0) {
    return { ...empty, ok: true, ignoradas, error: 'No se encontraron facturas FEIT ni notas crédito en el archivo.' }
  }

  // ── 1. Reemplazar todas las NOTA_CREDITO ──────────────────────────────────────
  const { error: delErr } = await supabase.from('invoices').delete().eq('invoice_type', 'NOTA_CREDITO')
  if (delErr) {
    console.error('[libroDiario] error borrando notas crédito:', delErr.message, '· code:', delErr.code)
    // El enum invoice_type todavía no tiene el valor 'NOTA_CREDITO' (invalid input value for enum)
    if (/enum invoice_type/i.test(delErr.message) || delErr.code === '22P02') {
      return { ...empty, error: "Falta agregar 'NOTA_CREDITO' al enum. Corre en Supabase: alter type public.invoice_type add value if not exists 'NOTA_CREDITO';" }
    }
    return { ...empty, error: `No se pudieron eliminar las notas crédito existentes: ${delErr.message}` }
  }

  // ── 2. Upsert de EMITIDAS (preserva trip_id y flags de anulación: no van en el payload) ──
  let facturasNuevas = 0, facturasActualizadas = 0
  if (emitidas.length) {
    const numbers = emitidas.map(f => f.invoice_number)
    const { data: existentes } = await supabase.from('invoices').select('invoice_number').in('invoice_number', numbers)
    const existingSet = new Set((existentes ?? []).map((e: any) => e.invoice_number))
    facturasNuevas = emitidas.filter(f => !existingSet.has(f.invoice_number)).length
    facturasActualizadas = emitidas.length - facturasNuevas

    const { error: upErr } = await supabase.from('invoices').upsert(emitidas, { onConflict: 'invoice_number' })
    if (upErr) {
      console.error('[libroDiario] error en upsert de facturas:', upErr.message, '· code:', upErr.code)
      if (upErr.code === '42P10' || upErr.code === '42703' || upErr.code === 'PGRST204') {
        return { ...empty, error: `Falta la restricción UNIQUE sobre invoice_number (o una columna). Ejecuta el SQL de facturas/actions.ts. (${upErr.message})` }
      }
      return { ...empty, error: upErr.message }
    }
  }

  // ── 3. Insertar las NOTA_CREDITO reconstruidas ────────────────────────────────
  if (notas.length) {
    const { error: ncErr } = await supabase.from('invoices').upsert(notas, { onConflict: 'invoice_number' })
    if (ncErr) {
      console.error('[libroDiario] error insertando notas crédito:', ncErr.message)
      return { ...empty, facturas: emitidas.length, facturasNuevas, facturasActualizadas, ignoradas, error: `Facturas ok, pero fallaron las notas crédito: ${ncErr.message}` }
    }
  }

  revalidatePath('/facturas')
  revalidatePath('/facturas/clientes')
  return {
    ok: true,
    facturas: emitidas.length,
    facturasNuevas,
    facturasActualizadas,
    notasCredito: notas.length,
    ignoradas,
  }
}
