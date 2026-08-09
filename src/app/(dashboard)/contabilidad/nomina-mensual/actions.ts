'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type NominaResultado = { ok: boolean; mensaje: string }

export type NominaInput = {
  conductorTerceroId: string
  driverName: string
  year: number
  month: number            // 1-12
  fondoTerceroId: string
  sueldo: number
  auxilio: number
  cesantias: number
  intereses: number
  prima: number
  vacaciones: number
  aporteArl: number
  aporteCaja: number
}

/**
 * Contabiliza (evento 8) UNA nómina mensual con los montos que Isabella digitó.
 * EPS y pensión ya NO se digitan: la función deriva el 4% empleado (EPS y pensión) y el 12%
 * patronal de pensión desde el Sueldo (IBC); EPS patronal = $0 (exoneración SIMPLE, regla fija).
 * Solo se pasan sueldo/auxilio, provisiones y los aportes 100% patronales (ARL, caja) + el fondo.
 * La función valida pre-corte + anti-duplicado por (conductor, mes). Periodo = último día del mes.
 */
export async function postearNominaAction(input: NominaInput): Promise<NominaResultado> {
  const { year, month } = input
  const lastDay = new Date(year, month, 0).getDate()
  const periodo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase.rpc('postear_nomina_mensual', {
    p_conductor:           input.conductorTerceroId,
    p_periodo:             periodo,
    p_sueldo:              input.sueldo,
    p_auxilio:             input.auxilio,
    p_cesantias:           input.cesantias,
    p_intereses_cesantias: input.intereses,
    p_prima:               input.prima,
    p_vacaciones:          input.vacaciones,
    p_aporte_arp:          input.aporteArl,
    p_aporte_caja:         input.aporteCaja,
    p_tercero_fondo:       input.fondoTerceroId || null,
  })

  if (error) return { ok: false, mensaje: error.message }

  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/nomina-mensual')
  return { ok: true, mensaje: `Nómina de ${input.driverName} (${periodo}) contabilizada · asiento CN-${asiento?.consecutivo}` }
}
