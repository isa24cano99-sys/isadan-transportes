'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { extraerPatron } from '@/lib/transaction-categorizer'

function extractTxnFields(formData: FormData) {
  return {
    type:           formData.get('type') as string,
    amount:         Number(formData.get('amount')),
    date:           formData.get('date') as string,
    category_id:    (formData.get('category_id') as string) || null,
    description:    formData.get('description') as string,
    reference_type: (formData.get('reference_type') as string) || null,
    reference_id:   (formData.get('reference_id') as string) || null,
    supplier_nit:   (formData.get('supplier_nit') as string) || null,
    supplier_name:  (formData.get('supplier_name') as string) || null,
  }
}

export async function crearTransaccionAction(formData: FormData) {
  const data = {
    account_id: formData.get('account_id') as string,
    ...extractTxnFields(formData),
  }
  const { data: created, error } = await supabase.from('bank_transactions').insert(data).select().single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true, data: created }
}

export async function actualizarTransaccionAction(id: string, formData: FormData) {
  const fields = extractTxnFields(formData)
  const { error } = await supabase
    .from('bank_transactions')
    .update(fields)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Aprender el patrón si el usuario asignó una categoría manualmente
  if (fields.category_id && fields.description) {
    const pattern = extraerPatron(fields.description)
    if (pattern.length > 2) {
      const { data: existing } = await supabase
        .from('description_patterns')
        .select('id, match_count')
        .eq('pattern', pattern)
        .maybeSingle()

      if (existing) {
        const patternUpdate: Record<string, unknown> = {
          match_count: existing.match_count + 1,
          category_id: fields.category_id,
          updated_at:  new Date().toISOString(),
        }
        if (fields.supplier_nit) {
          patternUpdate.supplier_nit  = fields.supplier_nit
          patternUpdate.supplier_name = fields.supplier_name
        }
        await supabase.from('description_patterns').update(patternUpdate).eq('id', existing.id)
      } else {
        const patternInsert: Record<string, unknown> = { pattern, category_id: fields.category_id }
        if (fields.supplier_nit) {
          patternInsert.supplier_nit  = fields.supplier_nit
          patternInsert.supplier_name = fields.supplier_name
        }
        await supabase.from('description_patterns').insert(patternInsert)
      }
    }
  }

  revalidatePath('/bancos', 'layout')
  return { ok: true }
}

export async function eliminarTransaccionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('bank_transactions').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos', 'layout')
  return { ok: true }
}
