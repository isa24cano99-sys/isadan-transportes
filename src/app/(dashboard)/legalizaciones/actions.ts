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

export async function cambiarEstadoLegalizacionAction(
  id: string,
  status: 'BORRADOR' | 'PENDIENTE' | 'APROBADA',
): Promise<{ ok: boolean; error?: string; posted?: number; skipped?: number }> {
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
