'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function actualizarCuentaAction(
  id: string,
  data: { bank_name: string; account_number: string | null; initial_balance: number },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('bank_accounts').update(data).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true }
}

export async function eliminarCuentaAction(id: string): Promise<
  | { ok: true }
  | { ok: false; blocked: true; txnCount: number }
  | { ok: false; error: string }
> {
  const { count } = await supabase
    .from('bank_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', id)
  if ((count ?? 0) > 0) return { ok: false, blocked: true, txnCount: count! }
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true }
}
