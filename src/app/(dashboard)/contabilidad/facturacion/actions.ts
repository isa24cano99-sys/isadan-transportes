'use server'

import { supabase } from '@/lib/supabase'

export type EmitidaFE = {
  id: string
  folio: string
  prefix: string
  issue_date: string | null
  cliente: string
  total: number
  status: string
}

/**
 * Facturas EMITIDAS por ISADAN ya importadas (grupo='EMITIDO' en dian_invoices_import).
 * El import es único y vive en /contabilidad/conciliacion-costos (un archivo, ambas direcciones);
 * esta pantalla solo CONSUME lo ya importado — no sube nada (mismo patrón que peajes).
 */
export async function getEmitidasAction(): Promise<EmitidaFE[]> {
  const { data } = await supabase
    .from('dian_invoices_import')
    .select('id, folio, prefix, issue_date, name_receiver, total, status, terceros(razon_social)')
    .eq('grupo', 'EMITIDO')
    .order('issue_date', { ascending: false })

  return (data ?? []).map((r: unknown) => {
    const x = r as { id: string; folio: string | null; prefix: string | null; issue_date: string | null; name_receiver: string | null; total: number; status: string | null; terceros: { razon_social: string | null } | null }
    return {
      id: x.id,
      folio: x.folio ?? '',
      prefix: x.prefix ?? '',
      issue_date: x.issue_date,
      cliente: x.terceros?.razon_social ?? x.name_receiver ?? '—',
      total: Number(x.total),
      status: x.status ?? '',
    }
  })
}
