'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

const EXPENSE_TYPES = [
  'acpm_contado', 'cargue', 'descargue', 'peajes', 'comision_empresa',
  'llantas', 'engrase', 'lavada', 'parqueos', 'carrozada', 'descarrozada',
  'cambio_aceite', 'varada', 'otros',
]

export async function crearLegalizacionAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const trip_id   = formData.get('trip_id') as string
  const driver_id = formData.get('driver_id') as string || null
  const date      = formData.get('trip_date') as string
  const freight   = Number(formData.get('freight') ?? 0)
  const advance   = Number(formData.get('advance') ?? 0)
  const percentage = Number(formData.get('percentage') ?? 0)

  if (!trip_id || !date) {
    return { ok: false, error: 'Selecciona un viaje y fecha' }
  }

  const expenses: { expense_type: string; amount: number; description: string | null }[] = []
  let gastos_viaje = 0

  for (const type of EXPENSE_TYPES) {
    const amount = Number(formData.get(`exp_${type}`) ?? 0)
    if (amount > 0) {
      const description = type === 'otros' ? (formData.get('exp_otros_desc') as string || null) : null
      expenses.push({ expense_type: type, amount, description })
      gastos_viaje += amount
    }
  }

  const porcentaje_calculado = freight * (percentage / 100)
  const balance_anticipo = advance - gastos_viaje  // >0 sobró, <0 faltó
  const saldo_final = porcentaje_calculado - balance_anticipo  // >0 empresa debe, <0 conductor debe

  const { data: leg, error: legError } = await supabase
    .from('legalizations')
    .insert({
      trip_id,
      driver_id,
      date,
      advance_amount: advance,
      total_expenses: gastos_viaje,
      status: 'BORRADOR',
    })
    .select('id')
    .single()

  if (legError) {
    console.error(JSON.stringify(legError))
    return { ok: false, error: 'Error al guardar la legalización' }
  }

  if (expenses.length > 0) {
    const rows = expenses.map(e => ({
      legalization_id: leg.id,
      expense_type: e.expense_type,
      date: date,
      amount: e.amount,
      description: e.description,
    }))
    const { error: expError } = await supabase.from('legalization_expenses').insert(rows)
    if (expError) {
      console.error('[crearLegalizacionAction] Error insertando gastos:', JSON.stringify(expError))
      console.error('[crearLegalizacionAction] Rows enviados:', JSON.stringify(rows))
      return { ok: false, error: 'Legalización creada pero error al guardar gastos' }
    }
  }

  revalidatePath('/legalizaciones')
  return { ok: true }
}
