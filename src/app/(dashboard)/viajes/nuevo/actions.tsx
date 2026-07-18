'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

function extractFields(formData: FormData) {
  return {
    manifest_number: (formData.get('manifest_number') as string) || null,
    client_id:       formData.get('client_id') as string,
    vehicle_id:      formData.get('vehicle_id') as string,
    driver_id:       formData.get('driver_id') as string,
    origin:          formData.get('origin') as string,
    destination:     formData.get('destination') as string,
    load_date:       formData.get('load_date') as string,
    freight_value:   Number(formData.get('freight_value')),
    advance_amount:  Number(formData.get('advance_amount') ?? 0),
    notes:           (formData.get('notes') as string) || null,
    weight_kg:       formData.get('weight_kg') ? Number(formData.get('weight_kg')) || null : null,
    price_per_ton:   formData.get('price_per_ton') ? Number(formData.get('price_per_ton')) || null : null,
    load_content:    (formData.get('load_content') as string) || null,
  }
}

export async function crearViajeAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const fields = extractFields(formData)

  if (!fields.client_id || !fields.vehicle_id || !fields.driver_id ||
      !fields.origin || !fields.destination || !fields.load_date || !fields.freight_value) {
    return { ok: false, error: 'Completa todos los campos obligatorios' }
  }

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...fields, status: 'PLANEADO' })
    .select('id')
    .single()

  if (error || !trip) {
    console.error(error)
    return { ok: false, error: 'Error al guardar el viaje' }
  }

  // Crear legalización BORRADOR automáticamente (igual que el flujo de manifiesto),
  // para que ningún viaje quede sin legalización. driver_id/vehicle_id son obligatorios arriba.
  console.log('Creando legalización para viaje:', trip.id)
  const { error: legError } = await supabase.from('legalizations').insert({
    trip_id:        trip.id,
    driver_id:      fields.driver_id,
    vehicle_id:     fields.vehicle_id,
    date:           fields.load_date,
    advance_amount: fields.advance_amount ?? 0,
    total_expenses: 0,
    status:         'BORRADOR',
  })
  console.log('Resultado legalización:', legError ? legError : 'OK')

  revalidatePath('/viajes')
  return { ok: true }
}

export async function editarViajeAction(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const fields = extractFields(formData)

  if (!fields.client_id || !fields.vehicle_id || !fields.driver_id ||
      !fields.origin || !fields.destination || !fields.load_date || !fields.freight_value) {
    return { ok: false, error: 'Completa todos los campos obligatorios' }
  }

  const { error } = await supabase.from('trips').update(fields).eq('id', id)

  if (error) {
    console.error(error)
    return { ok: false, error: 'Error al guardar los cambios' }
  }

  // Sincronizar el anticipo con la legalización en BORRADOR de este viaje (si existe).
  // Solo se toca en BORRADOR: si ya está PENDIENTE/APROBADA no se modifican sus valores.
  const { error: legError } = await supabase
    .from('legalizations')
    .update({ advance_amount: fields.advance_amount })
    .eq('trip_id', id)
    .eq('status', 'BORRADOR')
  if (legError) console.error('[editarViaje] error actualizando legalización BORRADOR:', legError.message)

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true }
}

export async function actualizarEstadoAction(id: string, status: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('trips').update({ status }).eq('id', id)
  if (error) return { ok: false }
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true }
}
