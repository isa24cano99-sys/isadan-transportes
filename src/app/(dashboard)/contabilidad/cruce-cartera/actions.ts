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
 * Cruza (evento 4) el anticipo de los terceros seleccionados contra su cartera.
 * Llama postear_cruce_cartera_v3 por RPC (por tercero), una por una. La función
 * calcula el monto en firme = MIN(anticipo disponible, cartera pendiente) del tercero
 * desde el libro contable, y postea el asiento CX (DB 28050510 / CR 13050501) en la
 * misma transacción. Falla con mensaje claro si no hay nada que cruzar.
 */
export async function cruzarCarteraAction(
  entries: { id: string; ref: string }[],
): Promise<CruceResultado[]> {
  const resultados: CruceResultado[] = []
  for (const e of entries) {
    const { data, error } = await supabase.rpc('postear_cruce_cartera_v3', { p_tercero: e.id })
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
