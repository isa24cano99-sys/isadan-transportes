'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

// Inicio de actividades del RUT (casilla 47). La empresa arrancó de cero, sin
// sustitución patronal: ninguna contratación puede ser anterior a esta fecha.
const MIN_HIRE_DATE = '2026-01-30'

function validarHireDate(hire_date: string | null | undefined): string | null {
  if (!hire_date) return 'La fecha de contratación es obligatoria.'
  if (hire_date < MIN_HIRE_DATE) {
    return `La fecha de contratación no puede ser anterior al ${MIN_HIRE_DATE} (inicio de actividades de la empresa).`
  }
  return null
}

function extractFields(formData: FormData) {
  return {
    full_name:           formData.get('full_name') as string,
    document:            formData.get('document') as string,
    phone:               (formData.get('phone') as string) || null,
    hire_date:           formData.get('hire_date') as string,
    salary:              Number(formData.get('salary')),
    auxilio_transporte:  Number(formData.get('auxilio_transporte')) || 0,
    active:              formData.get('active') === 'true',
    address:             (formData.get('address') as string) || null,
    eps:                 (formData.get('eps') as string) || null,
    arl:                 (formData.get('arl') as string) || null,
    personal_references: (formData.get('personal_references') as string) || null,
    work_references:     (formData.get('work_references') as string) || null,
  }
}

export async function crearConductorAction(formData: FormData) {
  const fields = extractFields(formData)
  const vErr = validarHireDate(fields.hire_date)
  if (vErr) return { ok: false, error: vErr }
  const { data: created, error } = await supabase.from('drivers').insert(fields).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/conductores')
  return { ok: true, data: created }
}

export async function eliminarConductorAction(id: string, force = false): Promise<
  | { ok: true }
  | { ok: false; tripCount: number; legCount: number }
  | { ok: false; error: string }
> {
  if (!force) {
    const [{ count: tripCount }, { count: legCount }] = await Promise.all([
      supabase.from('trips').select('*', { count: 'exact', head: true }).eq('driver_id', id),
      supabase.from('legalizations').select('*', { count: 'exact', head: true }).eq('driver_id', id),
    ])
    const total = (tripCount ?? 0) + (legCount ?? 0)
    if (total > 0) return { ok: false, tripCount: tripCount ?? 0, legCount: legCount ?? 0 }
  }
  if (force) {
    await Promise.all([
      supabase.from('trips').update({ driver_id: null }).eq('driver_id', id),
      supabase.from('legalizations').update({ driver_id: null }).eq('driver_id', id),
    ])
  }
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/conductores')
  return { ok: true }
}

export async function actualizarConductorAction(formData: FormData) {
  const id = formData.get('id') as string
  const fields = extractFields(formData)
  const vErr = validarHireDate(fields.hire_date)
  if (vErr) return { ok: false, error: vErr }
  const { error } = await supabase.from('drivers').update(fields).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/conductores')
  return { ok: true }
}
