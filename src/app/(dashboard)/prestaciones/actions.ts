'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function guardarPrestacionesAction(data: {
  employee_id: string
  period: string
  cesantias: number
  intereses: number
  prima: number
  vacaciones: number
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('social_benefits')
    .insert({
      ...data,
      paid: true,
      paid_date: new Date().toISOString().split('T')[0],
    })

  if (error) {
    console.error(JSON.stringify(error))
    return { ok: false, error: `DB: ${error.message} (${error.code})` }
  }

  revalidatePath('/prestaciones')
  return { ok: true }
}
