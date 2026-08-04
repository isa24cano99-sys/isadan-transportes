'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type CausacionResultado = {
  tripId: string
  tripNumber: string
  ok: boolean
  mensaje: string
}

/**
 * Causa (evento 1) los viajes seleccionados llamando a postear_causacion_viaje por RPC,
 * uno por uno. La función es atómica y trae su propio guard anti-duplicado: si un viaje
 * ya tiene causación CI contabilizada, revienta con mensaje claro (no duplica). Nada se
 * contabiliza sin que el usuario confirme desde la pantalla.
 */
export async function causarViajesAction(
  viajes: { id: string; tripNumber: string }[],
): Promise<CausacionResultado[]> {
  const resultados: CausacionResultado[] = []
  for (const v of viajes) {
    const { data, error } = await supabase.rpc('postear_causacion_viaje', { p_trip_id: v.id })
    if (error) {
      resultados.push({ tripId: v.id, tripNumber: v.tripNumber, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ tripId: v.id, tripNumber: v.tripNumber, ok: true, mensaje: `Causado · asiento CI-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/causaciones')
  return resultados
}
