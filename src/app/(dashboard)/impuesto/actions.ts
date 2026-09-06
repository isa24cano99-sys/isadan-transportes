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
