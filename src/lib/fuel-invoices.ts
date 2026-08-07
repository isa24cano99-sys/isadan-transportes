import { supabase } from '@/lib/supabase'

// FE de proveedores clasificados como combustible (terceros.cuenta_puc_sugerida='61450510')
// — el universo del dropdown manual de la línea de ACPM en la legalización. Universo chico
// (~11 hoy); se traen todas y el formulario filtra por el mes de la legalización.
export type FuelInvoice = { id: string; issue_date: string; total: number; name_issuer: string }

export async function getCombustibleFE(): Promise<FuelInvoice[]> {
  const { data } = await supabase
    .from('dian_invoices_import')
    .select('id, issue_date, total, name_issuer, terceros!inner(cuenta_puc_sugerida)')
    .eq('terceros.cuenta_puc_sugerida', '61450510')
    .order('issue_date', { ascending: false })
  return ((data ?? []) as any[]).map(x => ({
    id: x.id,
    issue_date: x.issue_date ?? '',
    total: Number(x.total) || 0,
    name_issuer: x.name_issuer ?? '',
  }))
}
