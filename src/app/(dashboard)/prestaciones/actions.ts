'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'

export async function guardarPrestacionesAction(data: {
  entity_type: 'EMPLOYEE' | 'DRIVER'
  entity_id: string
  period: string
  cesantias: number
  intereses: number
  prima: number
  vacaciones: number
  paid_date?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { entity_type, entity_id, paid_date, ...rest } = data
  const employee_id = entity_type === 'EMPLOYEE' ? entity_id : null
  const driver_id   = entity_type === 'DRIVER'   ? entity_id : null

  const { error } = await supabase
    .from('social_benefits')
    .insert({
      ...rest,
      employee_id,
      driver_id,
      paid: true,
      paid_date: paid_date || hoyColombia(),
    })

  if (error) {
    console.error(JSON.stringify(error))
    return { ok: false, error: `DB: ${error.message} (${error.code})` }
  }

  revalidatePath('/prestaciones')
  return { ok: true }
}

export async function eliminarPrestacionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('social_benefits').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/prestaciones')
  return { ok: true }
}

export async function eliminarEmpleadoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error: sbErr } = await supabase
    .from('social_benefits').delete().eq('employee_id', id)
  if (sbErr) {
    console.error('[eliminarEmpleado] social_benefits:', sbErr)
    return { ok: false, error: sbErr.message }
  }
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) {
    console.error('[eliminarEmpleado] employees:', error)
    return { ok: false, error: error.message }
  }
  revalidatePath('/prestaciones')
  return { ok: true }
}
