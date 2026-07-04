'use server'

import { supabase } from '@/lib/supabase'
import { getDataicoCustomers } from '@/lib/dataico'
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

export async function sincronizarDataicoAction() {
  let customers
  try {
    customers = await getDataicoCustomers()
  } catch (e: any) {
    return { ok: false, error: e.message as string }
  }

  const rows = customers.map(c => ({
    dataico_id:       c.id,
    name:             c.company_name,
    nit:              c.party_identification ?? null,
    email:            c.email ?? null,
    phone:            c.phone ?? null,
    third_party_type: 'CLIENTE',
    active:           true,
  }))

  const { error } = await supabase
    .from('clients')
    .upsert(rows, { onConflict: 'dataico_id' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/clientes')
  return { ok: true, synced: rows.length }
}

export async function eliminarClienteAction(id: string, force = false): Promise<
  | { ok: true }
  | { ok: false; tripCount: number }
  | { ok: false; error: string }
> {
  if (!force) {
    const { count } = await supabase
      .from('trips').select('*', { count: 'exact', head: true }).eq('client_id', id)
    if ((count ?? 0) > 0) return { ok: false, tripCount: count! }
  }
  if (force) {
    await supabase.from('trips').update({ client_id: null }).eq('client_id', id)
  }
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes')
  return { ok: true }
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