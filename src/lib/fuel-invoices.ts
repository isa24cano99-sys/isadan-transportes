import { supabase } from '@/lib/supabase'
import { FE_LINEA_CUENTA, type FEClasificada } from '@/lib/fe-lineas'

// SERVER-ONLY (importa supabase con service key). Solo debe importarse desde server
// components / server actions. El tipo y la constante viven en '@/lib/fe-lineas' (client-safe);
// los componentes 'use client' importan de ahí, NUNCA de este archivo.
export type { FEClasificada } from '@/lib/fe-lineas'

const CUENTAS = Object.values(FE_LINEA_CUENTA)
const F2X = '900219834'

// FE enlazables desde la legalización (ACPM 61450510 / cargue 61450515 / descargue 61450535).
// Incluye las de proveedores YA clasificados en una de esas 3 cuentas Y las SIN CLASIFICAR
// (cuenta_puc_sugerida NULL) — para que un proveedor nuevo no quede invisible. Excluye las
// clasificadas en OTRA cuenta de costo (ruido). NC y F2X (peajes) quedan fuera.
export async function getFEClasificadas(): Promise<FEClasificada[]> {
  const [{ data }, { data: enlaces }] = await Promise.all([
    supabase
      .from('dian_invoices_import')
      .select('id, issue_date, total, name_issuer, terceros!inner(cuenta_puc_sugerida)')
      .eq('grupo', 'RECIBIDO')          // costos recibidos; las emitidas (issuer=ISADAN) no entran aquí
      .eq('document_type', 'Factura electrónica')
      .neq('nit_issuer', F2X)
      .order('issue_date', { ascending: false }),
    // enlaces existentes: qué FE ya está asignada y a qué legalización (ref legible)
    supabase
      .from('legalization_expenses')
      .select('matched_invoice_id, legalization_id, legalizations(date, trips(trip_number))')
      .not('matched_invoice_id', 'is', null),
  ])

  // mapa FE → { legalizacionId, ref }. Si una FE tuviera >1 enlace, gana el primero.
  const asignada = new Map<string, { id: string; ref: string }>()
  for (const e of (enlaces ?? []) as any[]) {
    if (!e.matched_invoice_id || asignada.has(e.matched_invoice_id)) continue
    const ref = e.legalizations?.trips?.trip_number
      || (e.legalizations?.date ? String(e.legalizations.date).slice(0, 10) : null)
      || String(e.legalization_id).slice(0, 8)
    asignada.set(e.matched_invoice_id, { id: e.legalization_id, ref })
  }

  // clasificada en una de las 3 cuentas O sin clasificar (null) — nunca en otra cuenta de costo
  const relevantes = ((data ?? []) as any[]).filter(x => {
    const c = x.terceros?.cuenta_puc_sugerida
    return c == null || CUENTAS.includes(c)
  })

  return relevantes.map(x => {
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
