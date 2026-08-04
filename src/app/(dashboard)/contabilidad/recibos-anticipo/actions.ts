'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type ReciboResultado = {
  btId: string
  ref: string
  ok: boolean
  mensaje: string
}

/**
 * Registra (evento 3) los movimientos seleccionados como recibo de anticipo de cliente
 * (DB 11100510 Banco / CR 28050510 Anticipo clientes). Llama postear_recibo_anticipo_banco
 * por RPC, uno por uno. La función verifica es_cliente + categoría "Anticipo de cliente" +
 * anti-duplicado. Nada se contabiliza sin confirmación explícita del usuario.
 */
export async function registrarAnticiposAction(
  movimientos: { id: string; ref: string }[],
): Promise<ReciboResultado[]> {
  const resultados: ReciboResultado[] = []
  for (const m of movimientos) {
    const { data, error } = await supabase.rpc('postear_recibo_anticipo_banco', { p_bank_transaction_id: m.id })
    if (error) {
      resultados.push({ btId: m.id, ref: m.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ btId: m.id, ref: m.ref, ok: true, mensaje: `Registrado · asiento RC-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/recibos-anticipo')
  return resultados
}
