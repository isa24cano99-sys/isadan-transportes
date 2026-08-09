'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type PagoResultado = {
  btId: string
  ref: string
  ok: boolean
  mensaje: string
}

async function postearPorRpc(
  rpc: string, movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  const resultados: PagoResultado[] = []
  for (const m of movimientos) {
    const { data, error } = await supabase.rpc(rpc, { p_bank_transaction_id: m.id })
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

/**
 * Pago a proveedor (DB 220501 / CR 11100510). Baja el pasivo ya causado.
 * postear_pago_proveedor_banco valida categoría (220501), tercero, pre-corte, anti-dup.
 */
export async function postearPagoProveedorAction(
  movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  return postearPorRpc('postear_pago_proveedor_banco', movimientos)
}

/**
 * Gasto directo (DB cuenta 5/6 de la categoría / CR 11100510). Reconoce el gasto en el
 * instante. postear_gasto_bancario_directo valida clase 5/6, no-6145xx, no-nómina/IVA,
 * pre-corte, anti-dup, y usa Consumidor Final si el movimiento no trae tercero.
 */
export async function postearGastoDirectoAction(
  movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  return postearPorRpc('postear_gasto_bancario_directo', movimientos)
}
