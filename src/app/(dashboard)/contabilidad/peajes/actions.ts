'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type PeajeResultado = { ok: boolean; mensaje: string }

/**
 * Causa (evento 7) el peaje mensual de F2X: calcula el neto del mes desde la FE
 * importada (facturas − notas crédito) y postea DB 61450575 / CR 220501 (tercero F2X).
 * El período llega como 'YYYY-MM'; se pasa el primer día del mes a la función, que
 * valida neto>0, pre-corte y anti-duplicado por (F2X, mes). Cero cálculo en el front.
 */
export async function postearPeajeMensualAction(periodo: string): Promise<PeajeResultado> {
  const { data, error } = await supabase.rpc('postear_peaje_mensual', { p_periodo: `${periodo}-01` })
  if (error) return { ok: false, mensaje: error.message }
  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/peajes')
  return { ok: true, mensaje: `Peaje ${periodo} causado · asiento CG-${asiento?.consecutivo}` }
}
