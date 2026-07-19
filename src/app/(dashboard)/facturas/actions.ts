'use server'

/*
Si falta alguna columna, ejecuta este SQL en Supabase antes de sincronizar:

alter table invoices add column if not exists dataico_id text unique;
alter table invoices add column if not exists dian_status text;
alter table invoices add column if not exists pdf_url text;
alter table invoices add column if not exists xml_url text;

-- Normalizar invoice_number SIN guion (correr ANTES de crear el índice único):
update invoices set invoice_number = replace(invoice_number, '-', '') where invoice_number like 'FEIT-%';
update trips    set dataico_invoice_id = replace(dataico_invoice_id, '-', '') where dataico_invoice_id like 'FEIT-%';

-- Para importarFacturasExcelAction (upsert por invoice_number).
-- OJO: Postgres NO soporta "add constraint if not exists"; usar un índice único idempotente,
-- que también sirve como target de ON CONFLICT (invoice_number):
create unique index if not exists invoices_invoice_number_key on invoices (invoice_number);
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { parseDateicoDate } from '@/lib/dataico'

// ── Importación desde el Excel "detallado" de Dataico ──────────────────────────
// Nota: Dataico NO tiene endpoint de listado de facturas por API, así que el Excel
// detallado (Ventas → Facturas → Exportar detallado) es la única vía para sincronizar
// el historial completo de facturas emitidas.

type ExcelImportResult = {
  ok: boolean
  procesadas: number
  nuevas: number
  actualizadas: number
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

/**
 * Importa el Excel "detallado" de Dataico (Ventas → Facturas → Exportar detallado).
 * El Excel trae UNA FILA POR ÍTEM, así que se agrupan las filas por NUMERO y se
 * suma ITEM_TOTAL para obtener el total de cada factura. Upsert por invoice_number
 * (el Excel no incluye el UUID/dataico_id).
 */
export async function importarFacturasExcelAction(file: File): Promise<ExcelImportResult> {
  if (!file || file.size === 0) {
    return { ok: false, procesadas: 0, nuevas: 0, actualizadas: 0, error: 'No se adjuntó archivo.' }
  }

  let sheetRows: Record<string, any>[]
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    sheetRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]
  } catch (e: any) {
    console.error('[importarFacturasExcel] error leyendo el Excel:', e.message)
    return { ok: false, procesadas: 0, nuevas: 0, actualizadas: 0, error: `No se pudo leer el Excel: ${e.message}` }
  }

  // Agrupar por NUMERO, sumando ITEM_TOTAL (una fila por ítem en el Excel).
  const byNumber = new Map<string, {
    invoice_number: string
    issue_date:     string
    client_name:    string
    client_nit:     string | null
    total_amount:   number
  }>()

  for (const row of sheetRows) {
    // El Excel ya trae el número sin guion; se normaliza por si acaso (invariante: DB sin guion).
    const invoiceNumber = String(row['NUMERO'] ?? '').trim().replace(/-/g, '')
    if (!invoiceNumber) continue // fila sin número (encabezado extra / vacía)

    const existing = byNumber.get(invoiceNumber)
    const itemTotal = toNumber(row['ITEM_TOTAL'])

    if (existing) {
      existing.total_amount += itemTotal
    } else {
      byNumber.set(invoiceNumber, {
        invoice_number: invoiceNumber,
        issue_date:     excelDateToIso(row['FECHA_EXPEDICION']),
        client_name:    cleanClientName(row['CLIENTE_NOMBRE']),
        client_nit:     String(row['CLIENTE_IDENTIFICATION'] ?? '').trim() || null,
        total_amount:   itemTotal,
      })
    }
  }

  const facturas = Array.from(byNumber.values())
  if (facturas.length === 0) {
    return { ok: true, procesadas: 0, nuevas: 0, actualizadas: 0 }
  }

  // Clasificar nuevas vs actualizadas antes del upsert.
  const numbers = facturas.map(f => f.invoice_number)
  const { data: existentes, error: selErr } = await supabase
    .from('invoices')
    .select('invoice_number')
    .in('invoice_number', numbers)

  if (selErr) {
    console.error('[importarFacturasExcel] error consultando existentes:', selErr.message)
    return { ok: false, procesadas: 0, nuevas: 0, actualizadas: 0, error: selErr.message }
  }

  const existingSet = new Set((existentes ?? []).map((e: any) => e.invoice_number))
  const nuevas = facturas.filter(f => !existingSet.has(f.invoice_number)).length
  const actualizadas = facturas.length - nuevas

  const rows = facturas.map(f => ({
    invoice_number: f.invoice_number,
    issue_date:     f.issue_date,
    client_name:    f.client_name,
    client_nit:     f.client_nit,
    total_amount:   f.total_amount,
    tax_amount:     0,
    invoice_type:   'EMITIDA',
  }))

  const { error: upsertErr } = await supabase
    .from('invoices')
    .upsert(rows, { onConflict: 'invoice_number' })

  if (upsertErr) {
    console.error('[importarFacturasExcel] error en upsert:', upsertErr.message)
    if (upsertErr.code === '42P10' || upsertErr.code === '42703' || upsertErr.code === 'PGRST204') {
      return {
        ok: false, procesadas: 0, nuevas: 0, actualizadas: 0,
        error: `Falta la restricción UNIQUE sobre invoice_number (o una columna). Ejecuta el SQL de facturas/actions.ts. (${upsertErr.message})`,
      }
    }
    return { ok: false, procesadas: 0, nuevas: 0, actualizadas: 0, error: upsertErr.message }
  }

  revalidatePath('/facturas')
  revalidatePath('/facturas/clientes')
  return { ok: true, procesadas: facturas.length, nuevas, actualizadas }
}
