'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type ComisionResultado = { id: string; ref: string; ok: boolean; mensaje: string }

/**
 * Contabiliza (evento 6) la comisión empresa de las legalizaciones seleccionadas.
 * Llama postear_comision_empresa por RPC. Tercero = CONSUMIDOR FINAL (default de la
 * función; no se pasa p_tercero). DB 61450580 / CR 13301510, centro de costo = placa.
 * Guards: pre-corte y anti-duplicado por cuenta. Cero automatismo.
 */
export async function postearComisionAction(
  items: { id: string; placa: string; monto: number; fecha: string; ref: string }[],
): Promise<ComisionResultado[]> {
  const resultados: ComisionResultado[] = []
  for (const it of items) {
    const { data, error } = await supabase.rpc('postear_comision_empresa', {
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
  revalidatePath('/contabilidad/comision-empresa')
  return resultados
}
