'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type AbonoResumen = {
  cuotaAnterior: number
  cuotaNueva: number
  cuotasRestantesAntes: number
  cuotasRestantesDespues: number
  ahorroIntereses: number
}

function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const total    = y * 12 + (m - 1) + n
  const newYear  = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Registra el pago de una cuota específica.
 * Si applyExtraordinary=true y monto > cuota, recalcula las cuotas restantes.
 */
export async function registrarPagoAction(
  loanId: string,
  installmentId: string,
  monto: number,
  fecha: string,
  applyExtraordinary: boolean,
  opcion?: 'REDUCIR_CUOTA' | 'REDUCIR_PLAZO',
): Promise<{
  ok: boolean
  error?: string
  hadExtraordinary: boolean
  resumen?: AbonoResumen
}> {
  const [{ data: inst, error: instErr }, { data: loan, error: loanErr }] = await Promise.all([
    supabase
      .from('loan_installments')
      .select('id, installment_number, due_date, capital, interest, payment_amount, remaining_balance, status')
      .eq('id', installmentId)
      .single(),
    supabase
      .from('loans')
      .select('id, interest_rate, monthly_payment')
      .eq('id', loanId)
      .single(),
  ])

  if (instErr || !inst) return { ok: false, error: 'Cuota no encontrada', hadExtraordinary: false }
  if (loanErr || !loan) return { ok: false, error: 'Préstamo no encontrado', hadExtraordinary: false }

  // Marcar la cuota seleccionada como PAGADA con la fecha real
  const { error: updateErr } = await supabase
    .from('loan_installments')
    .update({ status: 'PAGADA', paid_date: fecha })
    .eq('id', installmentId)

  if (updateErr) return { ok: false, error: `Error al marcar como pagada: ${updateErr.message}`, hadExtraordinary: false }

  const extraCapital = monto - Number(inst.payment_amount)

  // Sin abono extraordinario → listo
  if (!applyExtraordinary || extraCapital <= 0) {
    revalidatePath(`/prestamos/${loanId}`)
    revalidatePath('/prestamos')
    return { ok: true, hadExtraordinary: false }
  }

  // ── Recalcular desde la cuota inmediatamente POSTERIOR A LA FECHA del abono ──
  // (no desde la cuota seleccionada). Las cuotas anteriores/iguales a la fecha no cambian.
  const { data: remaining, error: remErr } = await supabase
    .from('loan_installments')
    .select('id, installment_number, due_date, capital, interest, payment_amount, remaining_balance')
    .eq('loan_id', loanId)
    .eq('status', 'PENDIENTE')
    .gt('due_date', fecha)
    .order('due_date')
    .order('installment_number')

  if (remErr) return { ok: false, error: `Error leyendo cuotas restantes: ${remErr.message}`, hadExtraordinary: false }

  const interesesAntes  = (remaining ?? []).reduce((s, i) => s + Number(i.interest), 0)
  const cuotasRestAntes = (remaining ?? []).length
  const firstNext       = remaining?.[0]

  // Saldo entrando a la primera cuota a recalcular (= su saldo + su capital), menos el abono.
  const baseBalance = firstNext
    ? Number(firstNext.remaining_balance) + Number(firstNext.capital)
    : Number(inst.remaining_balance)
  const newSaldo = baseBalance - extraCapital

  // Fila especial "Abono a capital" en la fecha del abono. installment_number negativo
  // único (< 1) → marcador que no colisiona con las cuotas reales (1..N).
  const { data: prevAbonos } = await supabase
    .from('loan_installments')
    .select('id')
    .eq('loan_id', loanId)
    .lt('installment_number', 1)
  const abonoRow = {
    loan_id:            loanId,
    installment_number: -((prevAbonos?.length ?? 0) + 1),
    due_date:           fecha,
    capital:            Math.round(extraCapital),
    interest:           0,
    payment_amount:     Math.round(extraCapital),
    remaining_balance:  Math.max(0, Math.round(newSaldo)),
    status:             'PAGADA',
    paid_date:          fecha,
  }

  // El abono cancela el saldo completamente
  if (newSaldo <= 0 || !firstNext || !cuotasRestAntes) {
    if (cuotasRestAntes) {
      await supabase.from('loan_installments').delete().in('id', remaining!.map(i => i.id))
    }
    await supabase.from('loan_installments').insert(abonoRow)
    revalidatePath(`/prestamos/${loanId}`)
    revalidatePath('/prestamos')
    return {
      ok: true,
      hadExtraordinary: true,
      resumen: {
        cuotaAnterior:          Number(loan.monthly_payment),
        cuotaNueva:             0,
        cuotasRestantesAntes:   cuotasRestAntes,
        cuotasRestantesDespues: 0,
        ahorroIntereses:        Math.round(interesesAntes),
      },
    }
  }

  const r = Number(loan.interest_rate) / 100
  let nuevaCuota: number
  let n: number

  if (opcion === 'REDUCIR_CUOTA') {
    n = cuotasRestAntes
    const factor = Math.pow(1 + r, n)
    nuevaCuota   = (newSaldo * r * factor) / (factor - 1)
  } else {
    nuevaCuota = Number(loan.monthly_payment)
    if (newSaldo * r >= nuevaCuota) {
      return { ok: false, error: 'La cuota actual no cubre los intereses del saldo restante', hadExtraordinary: true }
    }
    n = Math.ceil(Math.log(nuevaCuota / (nuevaCuota - newSaldo * r)) / Math.log(1 + r))
  }

  // Construir nueva tabla de amortización
  const startNum  = firstNext.installment_number as number
  const startDate = firstNext.due_date as string
  const newRows: object[] = []
  let balance = newSaldo

  for (let i = 0; i < n; i++) {
    const interest = balance * r
    const capital  = nuevaCuota - interest
    balance        = Math.max(0, balance - capital)
    newRows.push({
      loan_id:            loanId,
      installment_number: startNum + i,
      due_date:           addMonths(startDate, i),
      capital:            Math.round(capital),
      interest:           Math.round(interest),
      payment_amount:     Math.round(nuevaCuota),
      remaining_balance:  Math.round(balance),
      status:             'PENDIENTE',
    })
  }

  const interesesDespues = newRows.reduce((s, r: any) => s + r.interest, 0)
  const ahorroIntereses  = Math.max(0, Math.round(interesesAntes - interesesDespues))

  const { error: delErr } = await supabase
    .from('loan_installments')
    .delete()
    .in('id', remaining!.map(i => i.id))

  if (delErr) return { ok: false, error: `Error eliminando cuotas: ${delErr.message}`, hadExtraordinary: true }

  // Insertar la fila del abono + las cuotas recalculadas
  const { error: insErr } = await supabase.from('loan_installments').insert([abonoRow, ...newRows])
  if (insErr) return { ok: false, error: `Error insertando cuotas: ${insErr.message}`, hadExtraordinary: true }

  if (opcion === 'REDUCIR_CUOTA') {
    await supabase.from('loans').update({ monthly_payment: Math.round(nuevaCuota) }).eq('id', loanId)
  }

  revalidatePath(`/prestamos/${loanId}`)
  revalidatePath('/prestamos')

  return {
    ok: true,
    hadExtraordinary: true,
    resumen: {
      cuotaAnterior:          Number(loan.monthly_payment),
      cuotaNueva:             Math.round(nuevaCuota),
      cuotasRestantesAntes:   cuotasRestAntes,
      cuotasRestantesDespues: n,
      ahorroIntereses,
    },
  }
}
