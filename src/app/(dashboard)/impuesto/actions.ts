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
