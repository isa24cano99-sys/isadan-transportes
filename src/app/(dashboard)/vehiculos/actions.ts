'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearVehiculoAction(formData: FormData) {
  const data = {
    plate: formData.get('plate') as string,
    brand: formData.get('brand') as string,
    model: formData.get('model') as string,
    year: Number(formData.get('year')),
    status: formData.get('status') as string,
    notes: formData.get('notes') as string || null,
  }
  const { data: created, error } = await supabase.from('vehicles').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/vehiculos')
  return { ok: true, data: created }
}

export async function actualizarVehiculoAction(formData: FormData) {
  const id = formData.get('id') as string
  const data = {
    plate: formData.get('plate') as string,
    brand: formData.get('brand') as string,
    model: formData.get('model') as string,
    year: Number(formData.get('year')),
    status: formData.get('status') as string,
    notes: formData.get('notes') as string || null,
  }
  const { error } = await supabase.from('vehicles').update(data).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/vehiculos')
  return { ok: true }
}