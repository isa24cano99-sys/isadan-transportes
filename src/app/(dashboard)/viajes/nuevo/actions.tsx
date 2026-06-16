'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearViajeAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const client_id      = formData.get('client_id') as string
  const vehicle_id     = formData.get('vehicle_id') as string
  const driver_id      = formData.get('driver_id') as string
  const origin         = formData.get('origin') as string
  const destination    = formData.get('destination') as string
  const load_date      = formData.get('load_date') as string
  const delivery_date  = formData.get('delivery_date') as string || null
  const freight_value  = Number(formData.get('freight_value'))
  const advance_amount = Number(formData.get('advance_amount') ?? 0)
  const notes          = formData.get('notes') as string || null

  if (!client_id || !vehicle_id || !driver_id || !origin || !destination || !load_date || !freight_value) {
    return { ok: false, error: 'Completa todos los campos obligatorios' }
  }

  const { error } = await supabase.from('trips').insert({
    client_id,
    vehicle_id,
    driver_id,
    origin,
    destination,
    load_date,
    delivery_date,
    freight_value,
    advance_amount,
    notes,
    status: 'PLANEADO',
  })

  if (error) {
    console.error(error)
    return { ok: false, error: 'Error al guardar el viaje' }
  }

  revalidatePath('/viajes')
  return { ok: true }
}

export async function actualizarEstadoAction(id: string, status: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('trips').update({ status }).eq('id', id)
  if (error) return { ok: false }
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true }
}