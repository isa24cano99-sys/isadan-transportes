'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type AnticipoResultado = {
  btId: string
  ref: string
  ok: boolean
  mensaje: string
}

/**
 * Contabiliza (evento nuevo) la entrega de anticipo a conductor de los movimientos
 * seleccionados (DB 13301510 Anticipo a trabajadores / CR 11100510 Banco). Llama
 * postear_anticipo_conductor_banco por RPC, uno por uno. La función valida que el
 * tercero sea conductor (existe en drivers), categoría 13301510, pre-corte y
 * anti-duplicado. Nada se contabiliza sin confirmación explícita.
 */
export async function postearAnticipoConductorAction(
  movimientos: { id: string; ref: string }[],
): Promise<AnticipoResultado[]> {
  const resultados: AnticipoResultado[] = []
  for (const m of movimientos) {
    const { data, error } = await supabase.rpc('postear_anticipo_conductor_banco', { p_bank_transaction_id: m.id })
    if (error) {
      resultados.push({ btId: m.id, ref: m.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ btId: m.id, ref: m.ref, ok: true, mensaje: `Contabilizado · asiento CB-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/anticipo-conductor')
  return resultados
}
