import { supabase } from '@/lib/supabase'
import { FE_LINEA_CUENTA, type FEClasificada } from '@/lib/fe-lineas'

// SERVER-ONLY (importa supabase con service key). Solo debe importarse desde server
// components / server actions. El tipo y la constante viven en '@/lib/fe-lineas' (client-safe);
// los componentes 'use client' importan de ahí, NUNCA de este archivo.
export type { FEClasificada } from '@/lib/fe-lineas'

const CUENTAS = Object.values(FE_LINEA_CUENTA)

// FE de proveedores clasificados como servicios enlazables desde la legalización:
// combustible (61450510 → ACPM), cargue (61450515) y descargue (61450535).
export async function getFEClasificadas(): Promise<FEClasificada[]> {
  const [{ data }, { data: enlaces }] = await Promise.all([
    supabase
      .from('dian_invoices_import')
      .select('id, issue_date, total, name_issuer, terceros!inner(cuenta_puc_sugerida)')
      .in('terceros.cuenta_puc_sugerida', CUENTAS)
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

  return ((data ?? []) as any[]).map(x => {
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
