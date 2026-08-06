'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type CostoResultado = { id: string; ref: string; ok: boolean; mensaje: string }

/**
 * Contabiliza el costo de una factura DIAN de proveedor contra la cuenta elegida.
 *   tratamiento 'a' (pago directo) → crédito 11100510 Banco.
 *   tratamiento 'c' (causación)    → crédito 220501 Proveedores.
 * Y APRENDE: si el tercero del proveedor aún no tiene cuenta_puc_sugerida, guarda la
 * cuenta elegida — así la próxima factura del mismo proveedor viene pre-sugerida
 * (mostrada, editable, no forzada). Si ya tenía una, NO la sobrescribe (se corrige en /terceros).
 */
export async function postearCostoDianAction(
  input: { importId: string; terceroId: string | null; cuentaPuc: string; tratamiento: 'a' | 'c'; ref: string },
): Promise<CostoResultado> {
  const credito = input.tratamiento === 'a' ? '11100510' : '220501'
  const { data, error } = await supabase.rpc('postear_costo_dian', {
    p_import_id: input.importId,
    p_cuenta_puc: input.cuentaPuc,
    p_credito_puc: credito,
  })
  if (error) return { id: input.importId, ref: input.ref, ok: false, mensaje: error.message }

  // Aprender: fijar cuenta_puc_sugerida del proveedor si aún está en NULL
  if (input.terceroId) {
    const { data: t } = await supabase
      .from('terceros').select('cuenta_puc_sugerida').eq('id', input.terceroId).single()
    if (t && !t.cuenta_puc_sugerida) {
      await supabase.from('terceros').update({ cuenta_puc_sugerida: input.cuentaPuc }).eq('id', input.terceroId)
    }
  }

  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/conciliacion-costos')
  return { id: input.importId, ref: input.ref, ok: true, mensaje: `Contabilizado · asiento CG-${asiento?.consecutivo}` }
}
