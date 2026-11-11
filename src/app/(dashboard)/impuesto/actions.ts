'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'

// ── Causación del impuesto por bimestre ─────────────────────────────────────────

export type CausarImpuestoInput = {
  anio:     number
  bimestre: number
  nacional: number     // componente nacional (54050505), según el formulario 2593
  ica:      number      // ICA (54050510), según el formulario 2593
  soporte:  string      // formulario / recibo que respalda las cifras
}

// UN asiento CG: DB 54050505 (nacional) + DB 54050510 (ICA) / CR 241215, tercero DIAN, fechado el
// último día del bimestre. Los guards (periodo abierto, no causar dos veces, soporte) viven en la función SQL.
export async function causarImpuestoAction(
  input: CausarImpuestoInput,
): Promise<{ ok: boolean; error?: string; consecutivo?: number }> {
  const { data, error } = await supabase.rpc('postear_causacion_simple_bimestre', {
    p_anio:     input.anio,
    p_bimestre: input.bimestre,
    p_nacional: input.nacional,
    p_ica:      input.ica,
    p_soporte:  input.soporte,
  })
  if (error) return { ok: false, error: error.message }
  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/impuesto', 'layout')
  return { ok: true, consecutivo: asiento?.consecutivo as number }
}

// ── Reserva para impuestos (custodia socio) ─────────────────────────────────────

// Pata 1 — registra la salida del banco hacia el socio (DB 13251005 / CR banco).
// El socio y el monto los toma la función del movimiento bancario categorizado.
export async function registrarReservaAction(
  bankTransactionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('postear_reserva_impuesto_banco', {
    p_bank_transaction_id: bankTransactionId,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/impuesto', 'layout')
  return { ok: true }
}

// Pata 2 — cierra la reserva contra el impuesto ya causado (DB 241215 / CR 13251005).
// Cierre parcial permitido; los guards de saldo viven en la función SQL.
export async function cerrarReservaAction(
  terceroId: string,
  monto: number,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('postear_cierre_reserva_impuesto', {
    p_tercero: terceroId,
    p_monto:   monto,
    p_fecha:   hoyColombia(),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/impuesto', 'layout')
  return { ok: true }
}

// ── Pago del impuesto (DIAN) ────────────────────────────────────────────────────

export type PagoImpuestoInput = {
  fecha:             string
  total:             number
  mora:              number
  reserva:           number
  caja:              number
  banco:             number
  bankTransactionId: string | null
  terceroSocio:      string | null
  recibo:            string | null
}

// UN solo asiento CG: DB 241215 (total−mora) + DB 53959510 (mora) / CR 13251005 (reserva socio)
// + CR 110505 (caja) + CR 11100510 (banco). Todos los guards (fuentes=total, saldo 241215 a la
// fecha, reserva del socio a la fecha, enlace+anti-dup de banco) viven en la función SQL.
export async function postearPagoImpuestoAction(
  input: PagoImpuestoInput,
): Promise<{ ok: boolean; error?: string; consecutivo?: number }> {
  const { data, error } = await supabase.rpc('postear_pago_impuesto_simple', {
    p_fecha:               input.fecha,
    p_total:               input.total,
    p_mora:                input.mora,
    p_reserva:             input.reserva,
    p_caja:                input.caja,
    p_banco:               input.banco,
    p_bank_transaction_id: input.bankTransactionId,
    p_tercero_socio:       input.terceroSocio,
    p_recibo:              input.recibo,
  })
  if (error) return { ok: false, error: error.message }
  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/impuesto', 'layout')
  return { ok: true, consecutivo: asiento?.consecutivo as number }
}
