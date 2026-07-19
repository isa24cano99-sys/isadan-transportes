'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { extraerPatron } from '@/lib/transaction-categorizer'

/** Devuelve el cliente (nombre + NIT) del viaje, para sugerir el tercero. */
export async function obtenerClienteViajeAction(
  tripId: string,
): Promise<{ nit: string | null; name: string | null } | null> {
  if (!tripId) return null
  const { data } = await supabase
    .from('trips')
    .select('clients(name, nit)')
    .eq('id', tripId)
    .single()
  const c = (data as any)?.clients
  if (!c || (!c.name && !c.nit)) return null
  return { nit: c.nit ?? null, name: c.name ?? null }
}

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
  console.log('FormData recibido:', {
    category_id: formData.get('category_id'),
    category:    formData.get('category'),
    description: formData.get('description'),
    amount:      formData.get('amount'),
  })

  const data = {
    account_id: formData.get('account_id') as string,
    ...extractTxnFields(formData),
  }
  console.log('Datos a insertar en bank_transactions:', data)

  const { data: created, error } = await supabase.from('bank_transactions').insert(data).select().single()
  if (error) {
    console.error('Error insertando bank_transactions:', error.message, error.details)
    return { ok: false, error: error.message }
  }
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

export async function asignarCategoriaMasivaAction(
  ids: string[],
  categoryId: string,
): Promise<{ ok: boolean; error?: string; updated: number }> {
  if (!ids.length || !categoryId) return { ok: false, error: 'Datos incompletos', updated: 0 }

  const { data: txns } = await supabase
    .from('bank_transactions')
    .select('id, description')
    .in('id', ids)

  const { error } = await supabase
    .from('bank_transactions')
    .update({ category_id: categoryId })
    .in('id', ids)

  if (error) return { ok: false, error: error.message, updated: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patternUpdates: any[] = []
  for (const tx of (txns ?? [])) {
    if (!tx.description) continue
    const pattern = extraerPatron(tx.description)
    if (pattern.length <= 2) continue
    const { data: existing } = await supabase
      .from('description_patterns')
      .select('id, match_count')
      .eq('pattern', pattern)
      .maybeSingle()
    if (existing) {
      patternUpdates.push(
        supabase.from('description_patterns').update({
          match_count: existing.match_count + 1,
          category_id: categoryId,
          updated_at:  new Date().toISOString(),
        }).eq('id', existing.id),
      )
    } else {
      patternUpdates.push(
        supabase.from('description_patterns').insert({ pattern, category_id: categoryId }),
      )
    }
  }
  await Promise.all(patternUpdates)

  revalidatePath('/bancos', 'layout')
  return { ok: true, updated: ids.length }
}
