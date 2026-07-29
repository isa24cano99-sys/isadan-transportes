'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'

function buildInstallments(
  loanId: string,
  amount: number,
  rate: number,
  term: number,
  startDate: string,
) {
  const r      = rate / 100
  const factor = Math.pow(1 + r, term)
  const cuota  = (amount * r * factor) / (factor - 1)

  const [y, mo, day] = startDate.split('-').map(Number)
  const rows = []
  let balance = amount

  for (let i = 1; i <= term; i++) {
    const interest = balance * r
    const capital  = cuota - interest
    balance        = Math.max(0, balance - capital)

    const totalMonths = mo - 1 + i
    const dueYear     = y + Math.floor(totalMonths / 12)
    const dueMonth    = (totalMonths % 12) + 1

    rows.push({
      loan_id:            loanId,
      installment_number: i,
      due_date:           `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      capital:            Math.round(capital),
      interest:           Math.round(interest),
      payment_amount:     Math.round(cuota),
      remaining_balance:  Math.round(balance),
      status:             'PENDIENTE',
    })
  }
  return rows
}

export async function actualizarPrestamoAction(
  id: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const entity     = formData.get('entity') as string
  const amount     = Number(formData.get('amount') ?? 0)
  const rate       = Number(formData.get('interest_rate') ?? 0)
  const term       = Number(formData.get('term_months') ?? 0)
  const start_date = formData.get('start_date') as string

  if (!entity || !amount || !rate || !term || !start_date) {
    return { ok: false, error: 'Completa todos los campos' }
  }

  const r      = rate / 100
  const factor = Math.pow(1 + r, term)
  const cuota  = (amount * r * factor) / (factor - 1)

  const { error: updateError } = await supabase
    .from('loans')
    .update({
      entity,
      loan_amount:     amount,
      interest_rate:   rate,
      term_months:     term,
      start_date,
      monthly_payment: Math.round(cuota),
    })
    .eq('id', id)

  if (updateError) {
    console.error(JSON.stringify(updateError))
    return { ok: false, error: `DB: ${updateError.message}` }
  }

  // Borra cuotas existentes y regenera la tabla completa
  const { error: deleteError } = await supabase
    .from('loan_installments')
    .delete()
    .eq('loan_id', id)

  if (deleteError) {
    console.error(JSON.stringify(deleteError))
    return { ok: false, error: 'Error al regenerar cuotas' }
  }

  const { error: instError } = await supabase
    .from('loan_installments')
    .insert(buildInstallments(id, amount, rate, term, start_date))

  if (instError) {
    console.error(JSON.stringify(instError))
    return { ok: false, error: 'Préstamo actualizado pero error al regenerar cuotas' }
  }

  revalidatePath('/prestamos')
  return { ok: true }
}

export async function sincronizarCuotasAction(
  loanId: string,
): Promise<{ ok: boolean; synced?: number; error?: string }> {
  const today = hoyColombia()

  const { data: vencidas, error: fetchError } = await supabase
    .from('loan_installments')
    .select('id, due_date')
    .eq('loan_id', loanId)
    .eq('status', 'PENDIENTE')
    .lt('due_date', today)

  if (fetchError) {
    console.error(JSON.stringify(fetchError))
    return { ok: false, error: `DB: ${fetchError.message}` }
  }

  if (!vencidas || vencidas.length === 0) return { ok: true, synced: 0 }

  // Update individual por cuota: cada una recibe su propia due_date como paid_date
  for (const inst of vencidas) {
    const { error } = await supabase
      .from('loan_installments')
      .update({ status: 'PAGADA', paid_date: inst.due_date })
      .eq('id', inst.id)

    if (error) {
      console.error(JSON.stringify(error))
      return { ok: false, error: `DB: ${error.message}` }
    }
  }

  revalidatePath('/prestamos', 'layout')
  return { ok: true, synced: vencidas.length }
}

export async function pagarCuotaAction(
  installmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const today = hoyColombia()

  const { error } = await supabase
    .from('loan_installments')
    .update({ status: 'PAGADA', paid_date: today })
    .eq('id', installmentId)

  if (error) {
    console.error(JSON.stringify(error))
    return { ok: false, error: `DB: ${error.message}` }
  }

  revalidatePath('/prestamos', 'layout')
  return { ok: true }
}

export async function eliminarPrestamoAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  // Borra cuotas primero (por si no hay CASCADE configurado)
  await supabase.from('loan_installments').delete().eq('loan_id', id)

  const { error } = await supabase.from('loans').delete().eq('id', id)

  if (error) {
    console.error(JSON.stringify(error))
    return { ok: false, error: `DB: ${error.message}` }
  }

  revalidatePath('/prestamos')
  return { ok: true }
}
