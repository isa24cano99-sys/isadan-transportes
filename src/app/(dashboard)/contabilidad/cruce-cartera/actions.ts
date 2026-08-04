'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type CruceResultado = {
  entryId: string
  ref: string
  ok: boolean
  mensaje: string
}

/**
 * Cruza (evento 4) las carteras seleccionadas contra el anticipo del tercero.
 * Llama postear_cruce_cartera_v2 por RPC, una por una. La función calcula el monto
 * en firme = MIN(anticipo disponible, cartera pendiente, saldo de la factura), postea
 * el asiento CX (DB 28050510 / CR 13050501) y actualiza la AR entry en la misma
 * transacción. Falla con mensaje claro si no hay nada que cruzar.
 */
export async function cruzarCarteraAction(
  entries: { id: string; ref: string }[],
): Promise<CruceResultado[]> {
  const resultados: CruceResultado[] = []
  for (const e of entries) {
    const { data, error } = await supabase.rpc('postear_cruce_cartera_v2', { p_entry_id: e.id })
    if (error) {
      resultados.push({ entryId: e.id, ref: e.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ entryId: e.id, ref: e.ref, ok: true, mensaje: `Cruzado · asiento CX-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/cruce-cartera')
  return resultados
}
