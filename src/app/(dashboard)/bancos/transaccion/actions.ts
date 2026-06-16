'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearTransaccionAction(formData: FormData) {
  const newCatName = (formData.get('new_category_name') as string | null)?.trim()
  const newCatType = formData.get('new_category_type') as string | null

  if (newCatName && newCatType) {
    await supabase
      .from('transaction_categories')
      .upsert({ name: newCatName, type: newCatType }, { onConflict: 'name', ignoreDuplicates: false })
  }

  const data = {
    account_id:  formData.get('account_id') as string,
    type:        formData.get('type') as string,
    amount:      Number(formData.get('amount')),
    date:        formData.get('date') as string,
    category:    formData.get('category') as string,
    description: formData.get('description') as string,
  }

  const { data: created, error } = await supabase.from('bank_transactions').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true, data: created }
}
