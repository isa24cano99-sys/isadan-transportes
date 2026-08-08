'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function eliminarLegalizacionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await supabase.from('legalization_expenses').delete().eq('legalization_id', id)
  const { error } = await supabase.from('legalizations').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legalizaciones')
  return { ok: true }
}

export async function reabrirLegalizacionAction(
  id: string,
): Promise<{ ok: boolean; error?: string; asientosBorrados?: number }> {
  // Reabre una APROBADA borrando su CG (mecanismo encapsulado reabrir_legalizacion) y
  // dejándola en BORRADOR para corregir. Al reaprobar, aprobar_legalizacion la regenera.
  const { data, error } = await supabase.rpc('reabrir_legalizacion', { p_leg_id: id })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legalizaciones')
  const r = (data ?? {}) as { asientos_borrados?: number }
  return { ok: true, asientosBorrados: r.asientos_borrados ?? 0 }
}

export async function cambiarEstadoLegalizacionAction(
  id: string,
  status: 'BORRADOR' | 'PENDIENTE' | 'APROBADA',
): Promise<{ ok: boolean; error?: string; posted?: number; skipped?: number }> {
  // Guard: sacar una APROBADA de su estado (a BORRADOR/PENDIENTE) dejaría el CG huérfano.
  // Solo se reabre por "Reabrir para corregir" (que sí borra el CG).
  if (status !== 'APROBADA') {
    const { data: actual } = await supabase.from('legalizations').select('status').eq('id', id).single()
    if (actual?.status === 'APROBADA') {
      return { ok: false, error: 'Legalización aprobada (contabilizada). Usa "Reabrir para corregir" para reabrirla.' }
    }
  }

  // Aprobar dispara la contabilización atómica de TODOS los costos (aprobar_legalizacion):
  // pone status=APROBADA y postea las líneas en una sola transacción. Si algo falla, no
  // aprueba "a medias". Re-aprobar una ya contabilizada salta lo posteado (posted/skipped).
  if (status === 'APROBADA') {
    const { data, error } = await supabase.rpc('aprobar_legalizacion', { p_leg_id: id })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/legalizaciones')
    const r = (data ?? {}) as { posted?: number; skipped?: number }
    return { ok: true, posted: r.posted ?? 0, skipped: r.skipped ?? 0 }
  }

  const { error } = await supabase.from('legalizations').update({ status }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legalizaciones')
  return { ok: true }
}
