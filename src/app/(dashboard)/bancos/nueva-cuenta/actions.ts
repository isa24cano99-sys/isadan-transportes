'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearCuentaBancariaAction(formData: FormData) {
  const data = {
    bank_name: formData.get('bank_name') as string,
    account_number: (formData.get('account_number') as string) || null,
    initial_balance: Number(formData.get('initial_balance')),
  }
  const { data: created, error } = await supabase.from('bank_accounts').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true, data: created }
}
