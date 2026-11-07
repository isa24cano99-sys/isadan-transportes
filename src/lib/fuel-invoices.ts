import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import type { FEClasificada } from '@/lib/fe-lineas'

// SERVER-ONLY (importa supabase con service key). Solo debe importarse desde server
// components / server actions. El tipo y la constante viven en '@/lib/fe-lineas' (client-safe);
// los componentes 'use client' importan de ahí, NUNCA de este archivo.
export type { FEClasificada } from '@/lib/fe-lineas'

const F2X = '900219834'

// FE enlazables desde la legalización. Devuelve todas las FE recibidas (factura electrónica,
// sin NC ni F2X/peajes) con la cuenta de su tercero; el formulario filtra por línea y por mes.
export async function getFEClasificadas(): Promise<FEClasificada[]> {
  const [data, enlaces] = await Promise.all([
    fetchAll<any>((from, to) => supabase
      .from('dian_invoices_import')
      .select('id, issue_date, total, name_issuer, terceros!inner(cuenta_puc_sugerida)')
      .eq('grupo', 'RECIBIDO')          // costos recibidos; las emitidas (issuer=ISADAN) no entran aquí
      .eq('document_type', 'Factura electrónica')
      .neq('nit_issuer', F2X)
      .order('issue_date', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    // enlaces existentes: qué FE ya está asignada y a qué legalización (ref legible)
    fetchAll<any>((from, to) => supabase
      .from('legalization_expenses')
      .select('matched_invoice_id, legalization_id, legalizations(date, trips(trip_number))')
      .not('matched_invoice_id', 'is', null)
      .order('id', { ascending: true }).range(from, to)),
  ])

  // mapa FE → { legalizacionId, ref }. Si una FE tuviera >1 enlace, gana el primero.
  const asignada = new Map<string, { id: string; ref: string }>()
  for (const e of enlaces as any[]) {
    if (!e.matched_invoice_id || asignada.has(e.matched_invoice_id)) continue
    const ref = e.legalizations?.trips?.trip_number
      || (e.legalizations?.date ? String(e.legalizations.date).slice(0, 10) : null)
      || String(e.legalization_id).slice(0, 8)
    asignada.set(e.matched_invoice_id, { id: e.legalization_id, ref })
  }

  // Se devuelven TODAS las FE recibidas (no-F2X), con su `cuenta` de clasificación ('' = sin
  // clasificar). El filtro por línea (ACPM / cargue+descargue) y el mes lo aplica el formulario;
  // la casilla "ver todas las FE del mes" necesita además las clasificadas en otras cuentas.
  return (data as any[]).map(x => {
    const a = asignada.get(x.id)
    return {
      id: x.id,
      issue_date: x.issue_date ?? '',
      total: Number(x.total) || 0,
      name_issuer: x.name_issuer ?? '',
      cuenta: x.terceros?.cuenta_puc_sugerida ?? '',
      asignadaLegalizacionId: a?.id ?? null,
      asignadaRef: a?.ref ?? null,
    }
  })
}
