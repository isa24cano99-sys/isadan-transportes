import { supabase } from '@/lib/supabase'

// FE de proveedores clasificados como servicios enlazables desde la legalización:
// combustible (61450510 → ACPM), cargue (61450515) y descargue (61450535). El universo
// del dropdown manual de cada línea. Se traen todas y el formulario filtra por (cuenta, mes).
export type FEClasificada = { id: string; issue_date: string; total: number; name_issuer: string; cuenta: string }

// clave de línea de gasto fijo → cuenta de clasificación del tercero que la alimenta
export const FE_LINEA_CUENTA: Record<string, string> = {
  acpm_contado: '61450510',
  cargue:       '61450515',
  descargue:    '61450535',
}

const CUENTAS = Object.values(FE_LINEA_CUENTA)

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
