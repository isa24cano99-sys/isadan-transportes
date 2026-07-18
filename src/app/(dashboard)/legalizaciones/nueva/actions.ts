'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

type DynExpenseRow = { pucCode: string; categoryName: string; description: string; amount: number }

function buildLegalizationPayload(formData: FormData) {
  const trip_id    = formData.get('trip_id') as string
  const driver_id  = formData.get('driver_id') as string || null
  const date       = formData.get('trip_date') as string
  const freight    = Number(formData.get('freight') ?? 0)
  const advance    = Number(formData.get('advance') ?? 0)
  const percentage = Number(formData.get('percentage') ?? 0)

  const weight_kg    = formData.get('weight_kg')     ? Number(formData.get('weight_kg'))     : null
  const price_per_ton = formData.get('price_per_ton') ? Number(formData.get('price_per_ton')) : null

  const expenses: { expense_type: string; amount: number; description: string | null }[] = []
  let gastos_viaje = 0

  // 1. Gastos fijos: { expense_type: monto }. La clave (ej. 'acpm_contado') se guarda tal cual.
  const fixedRaw = formData.get('fixed_expenses') as string | null
  const fixed: Record<string, number> = fixedRaw ? JSON.parse(fixedRaw) : {}
  for (const [key, rawAmount] of Object.entries(fixed)) {
    const amt = Number(rawAmount) || 0
    if (amt > 0) {
      expenses.push({ expense_type: key, amount: amt, description: null })
      gastos_viaje += amt
    }
  }

  // 2. Gastos adicionales (dinámicos): expense_type = código PUC de la categoría.
  const dynRaw = formData.get('dynamic_expenses') as string | null
  const dynRows: DynExpenseRow[] = dynRaw ? JSON.parse(dynRaw) : []
  for (const row of dynRows) {
    if (row.amount > 0) {
      const expType = row.pucCode || row.categoryName.toLowerCase().replace(/\s+/g, '_').slice(0, 60) || 'otros'
      expenses.push({ expense_type: expType, amount: row.amount, description: row.description || null })
      gastos_viaje += row.amount
    }
  }

  // 3. Porcentaje conductor: se guarda como gasto y CUENTA dentro del total de gastos.
  const porcentaje_calculado = freight * (percentage / 100)
  if (porcentaje_calculado > 0) {
    expenses.push({
      expense_type: 'porcentaje',
      amount:       porcentaje_calculado,
      description:  String(percentage),  // se guarda el % crudo para recargar
    })
    gastos_viaje += porcentaje_calculado
  }

  // total_expenses = fijos + adicionales + porcentaje; balance (generado) = advance - total_expenses
  return { trip_id, driver_id, date, advance, gastos_viaje, expenses, weight_kg, price_per_ton }
}

export async function crearLegalizacionAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { trip_id, driver_id, date, advance, gastos_viaje, expenses, weight_kg, price_per_ton } = buildLegalizationPayload(formData)

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

  const tripUpdates: Record<string, number> = {}
  if (weight_kg    != null && !isNaN(weight_kg))    tripUpdates.weight_kg    = weight_kg
  if (price_per_ton != null && !isNaN(price_per_ton)) tripUpdates.price_per_ton = price_per_ton
  if (Object.keys(tripUpdates).length > 0) {
    await supabase.from('trips').update(tripUpdates).eq('id', trip_id)
  }

  revalidatePath('/legalizaciones')
  return { ok: true }
}

export async function actualizarLegalizacionAction(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { trip_id, driver_id, date, advance, gastos_viaje, expenses, weight_kg, price_per_ton } = buildLegalizationPayload(formData)

  if (!trip_id || !date) return { ok: false, error: 'Selecciona un viaje y fecha' }

  const { error: legError } = await supabase
    .from('legalizations')
    .update({ trip_id, driver_id, date, advance_amount: advance, total_expenses: gastos_viaje })
    .eq('id', id)

  if (legError) return { ok: false, error: 'Error al actualizar la legalización' }

  await supabase.from('legalization_expenses').delete().eq('legalization_id', id)

  if (expenses.length > 0) {
    const rows = expenses.map(e => ({ legalization_id: id, expense_type: e.expense_type, date, amount: e.amount, description: e.description }))
    const { error: expError } = await supabase.from('legalization_expenses').insert(rows)
    if (expError) return { ok: false, error: 'Error al guardar los gastos actualizados' }
  }

  const tripUpdates: Record<string, number> = {}
  if (weight_kg    != null && !isNaN(weight_kg))    tripUpdates.weight_kg    = weight_kg
  if (price_per_ton != null && !isNaN(price_per_ton)) tripUpdates.price_per_ton = price_per_ton
  if (Object.keys(tripUpdates).length > 0) {
    await supabase.from('trips').update(tripUpdates).eq('id', trip_id)
  }

  revalidatePath('/legalizaciones')
  return { ok: true }
}

export async function crearCuentaYCategoriaAction(params: {
  nombre: string
  codigo: string
}): Promise<{ ok: boolean; category?: { id: string; name: string; puc_code: string }; error?: string }> {
  const { error: pucErr } = await supabase
    .from('puc_accounts')
    .insert({ codigo: params.codigo, nombre: params.nombre, tipo: 'COSTO_OPERACIONAL', active: true })

  if (pucErr && !pucErr.message.includes('duplicate') && !pucErr.code?.includes('23505')) {
    return { ok: false, error: pucErr.message }
  }

  const { data: cat, error: catErr } = await supabase
    .from('transaction_categories')
    .insert({ name: params.nombre, type: 'NEGOCIO', puc_code: params.codigo, puc_tipo: 'COSTO_OPERACIONAL', active: true })
    .select('id, name, puc_code')
    .single()

  if (catErr) return { ok: false, error: catErr.message }

  revalidatePath('/legalizaciones')
  return { ok: true, category: cat as { id: string; name: string; puc_code: string } }
}
