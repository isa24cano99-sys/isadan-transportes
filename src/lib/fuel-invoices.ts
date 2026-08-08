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
  const { data } = await supabase
    .from('dian_invoices_import')
    .select('id, issue_date, total, name_issuer, terceros!inner(cuenta_puc_sugerida)')
    .in('terceros.cuenta_puc_sugerida', CUENTAS)
    .order('issue_date', { ascending: false })
  return ((data ?? []) as any[]).map(x => ({
    id: x.id,
    issue_date: x.issue_date ?? '',
    total: Number(x.total) || 0,
    name_issuer: x.name_issuer ?? '',
    cuenta: x.terceros?.cuenta_puc_sugerida ?? '',
  }))
}
