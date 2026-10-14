'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'

export type MarcarPagadoInput = {
  year: number
  bimestre: number
  income: number
  rst_gross: number
  pension_contribution: number
  ica: number
  rst_net: number
  total_to_pay: number
}

export async function marcarPagadoAction(
  input: MarcarPagadoInput,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('tax_payments')
    .upsert(
      {
        year:                 input.year,
        bimestre:             input.bimestre,
        income:               input.income,
        rst_gross:            input.rst_gross,
        pension_contribution: input.pension_contribution,
        ica:                  input.ica,
        rst_net:              input.rst_net,
        total_to_pay:         input.total_to_pay,
        paid:                 true,
        paid_date:            hoyColombia(),
      },
      { onConflict: 'year,bimestre' },
    )

  if (error) return { ok: false, error: error.message }
  revalidatePath('/impuesto', 'layout')
  return { ok: true }
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
