'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

const EXPENSE_TYPES = [
  'acpm_contado', 'cargue', 'descargue', 'peajes', 'comision_empresa',
  'llantas', 'engrase', 'lavada', 'parqueos', 'carrozada', 'descarrozada',
  'cambio_aceite', 'varada', 'otros',
]

function buildLegalizationPayload(formData: FormData) {
  const trip_id    = formData.get('trip_id') as string
  const driver_id  = formData.get('driver_id') as string || null
  const date       = formData.get('trip_date') as string
  const freight    = Number(formData.get('freight') ?? 0)
  const advance    = Number(formData.get('advance') ?? 0)
  const percentage = Number(formData.get('percentage') ?? 0)

  const expenses: { expense_type: string; amount: number; description: string | null }[] = []
  let gastos_viaje = 0
  for (const type of EXPENSE_TYPES) {
    const amount = Number(formData.get(`exp_${type}`) ?? 0)
    if (amount > 0) {
      expenses.push({
        expense_type: type,
        amount,
        description: type === 'otros' ? (formData.get('exp_otros_desc') as string || null) : null,
      })
      gastos_viaje += amount
    }
  }

  const porcentaje_calculado = freight * (percentage / 100)
  const balance_anticipo     = advance - gastos_viaje
  const saldo_final          = porcentaje_calculado - balance_anticipo

  if (porcentaje_calculado > 0) {
    expenses.push({
      expense_type: 'porcentaje',
      amount:       porcentaje_calculado,
      description:  String(percentage),   // store raw % in description for reload
    })
  }

  return { trip_id, driver_id, date, advance, gastos_viaje, saldo_final, expenses }
}

export async function crearLegalizacionAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { trip_id, driver_id, date, advance, gastos_viaje, saldo_final, expenses } = buildLegalizationPayload(formData)

  if (!trip_id || !date) return { ok: false, error: 'Selecciona un viaje y fecha' }

  const { data: leg, error: legError } = await supabase
    .from('legalizations')
    .insert({ trip_id, driver_id, date, advance_amount: advance, total_expenses: gastos_viaje, status: 'BORRADOR' })
    .select('id')
    .single()

  if (legError) {
    console.error(JSON.stringify(legError))
    return { ok: false, error: 'Error al guardar la legalización' }
  }

  if (expenses.length > 0) {
    const rows = expenses.map(e => ({ legalization_id: leg.id, expense_type: e.expense_type, date, amount: e.amount, description: e.description }))
    const { error: expError } = await supabase.from('legalization_expenses').insert(rows)
    if (expError) return { ok: false, error: 'Legalización creada pero error al guardar gastos' }
  }

  revalidatePath('/legalizaciones')
  return { ok: true }
}

export async function actualizarLegalizacionAction(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { trip_id, driver_id, date, advance, gastos_viaje, saldo_final, expenses } = buildLegalizationPayload(formData)

  if (!trip_id || !date) return { ok: false, error: 'Selecciona un viaje y fecha' }

  const { error: legError } = await supabase
    .from('legalizations')
    .update({ trip_id, driver_id, date, advance_amount: advance, total_expenses: gastos_viaje })
    .eq('id', id)

  if (legError) return { ok: false, error: 'Error al actualizar la legalización' }

  // Reemplazar gastos: borrar los anteriores e insertar los nuevos
  await supabase.from('legalization_expenses').delete().eq('legalization_id', id)

  if (expenses.length > 0) {
    const rows = expenses.map(e => ({ legalization_id: id, expense_type: e.expense_type, date, amount: e.amount, description: e.description }))
    const { error: expError } = await supabase.from('legalization_expenses').insert(rows)
    if (expError) return { ok: false, error: 'Error al guardar los gastos actualizados' }
  }

  revalidatePath('/legalizaciones')
  return { ok: true }
}
