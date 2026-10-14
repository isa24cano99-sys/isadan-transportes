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

/**
 * Asigna el tercero (cliente) a un movimiento bancario que llegó sin tercero. Solo escribe
 * bank_transactions.tercero_id — NO contabiliza. Tras asignarlo, el movimiento pasa a la lista
 * normal de anticipos (deja de estar "falta tercero").
 */
export async function asignarTerceroAction(btId: string, terceroId: string): Promise<{ ok: boolean; error?: string }> {
  if (!btId || !terceroId) return { ok: false, error: 'Falta el movimiento o el tercero.' }
  const { error } = await supabase.from('bank_transactions').update({ tercero_id: terceroId }).eq('id', btId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/contabilidad/recibos-anticipo')
  return { ok: true }
}
