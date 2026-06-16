'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearClienteAction(formData: FormData) {
  const data = {
    name: formData.get('name') as string,
    nit: formData.get('nit') as string || null,
    phone: formData.get('phone') as string || null,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
  }
  const { data: created, error } = await supabase.from('clients').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes')
  return { ok: true, data: created }
}

export async function actualizarClienteAction(formData: FormData) {
  const id = formData.get('id') as string
  const data = {
    name: formData.get('name') as string,
    nit: formData.get('nit') as string || null,
    phone: formData.get('phone') as string || null,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
  }
  const { error } = await supabase.from('clients').update(data).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes')
  return { ok: true }
}