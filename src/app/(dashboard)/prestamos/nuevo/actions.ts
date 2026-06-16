'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { sincronizarCuotasAction } from '../actions'

export async function crearPrestamoAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const entity     = formData.get('entity') as string
  const amount     = Number(formData.get('amount') ?? 0)
  const rate       = Number(formData.get('interest_rate') ?? 0)
  const term       = Number(formData.get('term_months') ?? 0)
  const start_date = formData.get('start_date') as string

  if (!entity || !amount || !rate || !term || !start_date) {
    return { ok: false, error: 'Completa todos los campos' }
  }

  // Amortización francesa: C = P * r*(1+r)^n / ((1+r)^n - 1)
  const r      = rate / 100
  const factor = Math.pow(1 + r, term)
  const cuota  = (amount * r * factor) / (factor - 1)

  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .insert({
      entity,
      loan_amount:     amount,
      interest_rate:   rate,
      term_months:     term,
      start_date,
      monthly_payment: Math.round(cuota),
      active:          true,
    })
    .select('id')
    .single()

  if (loanError) {
    console.error(JSON.stringify(loanError))
    return { ok: false, error: `DB: ${loanError.message} (${loanError.code})` }
  }

  // Generar tabla de amortización
  const [y, mo, day] = start_date.split('-').map(Number)
  const installments = []
  let balance = amount

  for (let i = 1; i <= term; i++) {
    const interest = balance * r
    const capital  = cuota - interest
    balance        = Math.max(0, balance - capital)

    const totalMonths = mo - 1 + i
    const dueYear     = y + Math.floor(totalMonths / 12)
    const dueMonth    = (totalMonths % 12) + 1

    installments.push({
      loan_id:            loan.id,
      installment_number: i,
      due_date:           `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      capital:            Math.round(capital),
      interest:           Math.round(interest),
      payment_amount:     Math.round(cuota),
      remaining_balance:  Math.round(balance),
      status:             'PENDIENTE',
    })
  }

  const { error: instError } = await supabase
    .from('loan_installments')
    .insert(installments)

  if (instError) {
    console.error(JSON.stringify(instError))
    return { ok: false, error: 'Préstamo creado pero error al generar cuotas' }
  }

  // Marca automáticamente como pagadas las cuotas con fecha ya vencida
  await sincronizarCuotasAction(loan.id)

  revalidatePath('/prestamos', 'layout')
  return { ok: true, id: loan.id }
}
