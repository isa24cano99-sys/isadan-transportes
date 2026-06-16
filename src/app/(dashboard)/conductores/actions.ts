'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearConductorAction(formData: FormData) {
  const data = {
    full_name: formData.get('full_name') as string,
    document: formData.get('document') as string,
    phone: formData.get('phone') as string || null,
    hire_date: formData.get('hire_date') as string,
    salary: Number(formData.get('salary')),
    active: formData.get('active') === 'true',
  }
  const { data: created, error } = await supabase.from('drivers').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/conductores')
  return { ok: true, data: created }
}

export async function actualizarConductorAction(formData: FormData) {
  const id = formData.get('id') as string
  const data = {
    full_name: formData.get('full_name') as string,
    document: formData.get('document') as string,
    phone: formData.get('phone') as string || null,
    hire_date: formData.get('hire_date') as string,
    salary: Number(formData.get('salary')),
    active: formData.get('active') === 'true',
  }
  const { error } = await supabase.from('drivers').update(data).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/conductores')
  return { ok: true }
}