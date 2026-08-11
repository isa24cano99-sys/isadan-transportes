'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type ReversionResultado = { ok: boolean; mensaje: string }

/**
 * Reversa un asiento posteando su espejo (serie RV) con anula_a y un motivo escrito
 * obligatorio. Envuelve el RPC postear_reversion, que valida: motivo no vacío, asiento
 * CONTABILIZADO, no reversar RV/CA/CC, no doble reversión, periodo no bloqueado.
 */
export async function postearReversionAction(entryId: string, motivo: string): Promise<ReversionResultado> {
  if (!entryId) return { ok: false, mensaje: 'Falta el asiento a reversar.' }
  if (!motivo || !motivo.trim()) return { ok: false, mensaje: 'El motivo de la reversión es obligatorio.' }

  const { data, error } = await supabase.rpc('postear_reversion', {
    p_entry_id: entryId, p_motivo: motivo.trim(),
  })
  if (error) return { ok: false, mensaje: error.message }

  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/libro-diario')
  return { ok: true, mensaje: `Reversado · asiento RV-${e?.consecutivo}` }
}
