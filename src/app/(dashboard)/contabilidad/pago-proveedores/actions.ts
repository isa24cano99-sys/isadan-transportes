'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type PagoResultado = {
  btId: string
  ref: string
  ok: boolean
  mensaje: string
}

/**
 * Contabiliza el pago a proveedor de los movimientos seleccionados (DB 220501 /
 * CR 11100510 Banco). Llama postear_pago_proveedor_banco por RPC, uno por uno. La
 * función valida categoría (puc 220501), tercero, pre-corte y anti-duplicado. Lee el
 * tercero del movimiento — sirve para cualquier proveedor por 220501. Cero automatismo.
 */
export async function postearPagoProveedorAction(
  movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  const resultados: PagoResultado[] = []
  for (const m of movimientos) {
    const { data, error } = await supabase.rpc('postear_pago_proveedor_banco', { p_bank_transaction_id: m.id })
    if (error) {
      resultados.push({ btId: m.id, ref: m.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ btId: m.id, ref: m.ref, ok: true, mensaje: `Contabilizado · asiento CB-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/pago-proveedores')
  return resultados
}
