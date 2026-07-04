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
