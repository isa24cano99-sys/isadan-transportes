'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type EmisionResultado = {
  tripId: string
  tripNumber: string
  ok: boolean
  mensaje: string
}

/**
 * Emite (evento 2) los viajes seleccionados: reclasifica de CxC por facturar (13050502)
 * a cartera facturada (13050501). Llama postear_emision_viaje por RPC, uno por uno.
 * La función trae sus guards: exige causación CI previa y rechaza CF duplicado. Nada se
 * contabiliza sin confirmación explícita del usuario.
 */
export async function emitirViajesAction(
  viajes: { id: string; tripNumber: string }[],
): Promise<EmisionResultado[]> {
  const resultados: EmisionResultado[] = []
  for (const v of viajes) {
    const { data, error } = await supabase.rpc('postear_emision_viaje', { p_trip_id: v.id })
    if (error) {
      resultados.push({ tripId: v.id, tripNumber: v.tripNumber, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ tripId: v.id, tripNumber: v.tripNumber, ok: true, mensaje: `Emitido · asiento CF-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/emision-facturas')
  return resultados
}
