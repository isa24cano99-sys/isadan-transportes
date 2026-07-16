'use server'

/*
Si falta alguna columna, ejecuta este SQL en Supabase antes de sincronizar:

alter table invoices add column if not exists dataico_id text unique;
alter table invoices add column if not exists dian_status text;
alter table invoices add column if not exists pdf_url text;
alter table invoices add column if not exists xml_url text;
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getDataicoInvoices, parseDateicoDate } from '@/lib/dataico'

type SyncResult = { ok: boolean; synced: number; message?: string; error?: string }

/** Extrae el valor total de una factura de Dataico, con varios nombres posibles. */
function extractTotal(inv: Record<string, any>): number {
  const direct =
    inv.total ?? inv.total_amount ?? inv.total_value ?? inv.total_to_pay ?? inv.grand_total
  if (direct != null && !Number.isNaN(Number(direct))) return Number(direct)

  // Fallback: sumar los ítems (precio × cantidad).
  const items: any[] = Array.isArray(inv.items) ? inv.items : []
  return items.reduce((s, it) => s + Number(it?.price ?? 0) * Number(it?.quantity ?? 1), 0)
}

export async function sincronizarFacturasDataicoAction(): Promise<SyncResult> {
  // 1. Traer todas las facturas desde Dataico
  let dataicoInvoices: Record<string, any>[]
  try {
    dataicoInvoices = await getDataicoInvoices()
  } catch (e: any) {
    return { ok: false, synced: 0, error: `Error consultando Dataico: ${e.message}` }
  }

  // 2. Mapear a filas de la tabla invoices (solo las que traen UUID, requerido para el upsert)
  const rows = dataicoInvoices
    .map(inv => {
      const dataicoId = (inv.uuid ?? inv.id ?? '') as string
      if (!dataicoId) return null

      const customer = (inv.customer ?? {}) as Record<string, any>

      return {
        invoice_number: (inv.number ?? '') as string,
        cufe:           (inv.cufe ?? null) as string | null,
        issue_date:     parseDateicoDate(inv.issue_date as string),
        client_name:    (customer.company_name ?? inv.customer_name ?? null) as string | null,
        client_nit:     (customer.party_identification ?? inv.customer_nit ?? null) as string | null,
        total_amount:   extractTotal(inv),
        invoice_type:   'EMITIDA',
        dataico_id:     dataicoId,
        dian_status:    (inv.dian_status ?? null) as string | null,
        pdf_url:        (inv.pdf_url ?? null) as string | null,
        xml_url:        (inv.xml_url ?? null) as string | null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0) {
    return { ok: true, synced: 0, message: 'Dataico no devolvió facturas.' }
  }

  // 3. Upsert por dataico_id (requiere la restricción UNIQUE sobre dataico_id)
  const { error } = await supabase
    .from('invoices')
    .upsert(rows, { onConflict: 'dataico_id' })

  if (error) {
    // Columna faltante (42703) o esquema desactualizado (PGRST204) → recordar el SQL
    if (error.code === '42703' || error.code === 'PGRST204') {
      return {
        ok: false,
        synced: 0,
        error: `Falta una columna en la tabla invoices. Ejecuta el SQL del archivo facturas/actions.ts en Supabase. (${error.message})`,
      }
    }
    return { ok: false, synced: 0, error: error.message }
  }

  revalidatePath('/facturas')
  return { ok: true, synced: rows.length }
}
