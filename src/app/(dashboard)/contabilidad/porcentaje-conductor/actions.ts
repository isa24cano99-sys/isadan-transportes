'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type PorcentajeResultado = {
  id: string
  ref: string
  ok: boolean
  mensaje: string
}

/**
 * Contabiliza (evento 5) el porcentaje conductor de las legalizaciones seleccionadas.
 * Llama postear_porcentaje_conductor por RPC, una por una. La función valida
 * tercero del conductor, placa (centro de costo), pre-corte (>= 2026-07-01) y
 * anti-duplicado por cuenta (61450550). DB 61450550 / CR 13301510. Cero automatismo.
 */
export async function postearPorcentajeAction(
  items: { id: string; driverId: string; placa: string; monto: number; fecha: string; ref: string }[],
): Promise<PorcentajeResultado[]> {
  const resultados: PorcentajeResultado[] = []
  for (const it of items) {
    const { data, error } = await supabase.rpc('postear_porcentaje_conductor', {
      p_driver_id: it.driverId,
      p_placa:     it.placa,
      p_monto:     it.monto,
      p_fecha:     it.fecha,
      p_origen_id: it.id,
    })
    if (error) {
      resultados.push({ id: it.id, ref: it.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ id: it.id, ref: it.ref, ok: true, mensaje: `Contabilizado · asiento CG-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/porcentaje-conductor')
  return resultados
}
