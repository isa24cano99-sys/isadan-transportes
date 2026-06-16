'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearDocumentoAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const category        = formData.get('category') as string
  const entity_type     = formData.get('entity_type') as string
  const entity_id       = (formData.get('entity_id') as string) || null
  const file_name       = formData.get('file_name') as string
  const expiration_date = (formData.get('expiration_date') as string) || null
  const notes           = (formData.get('notes') as string) || null
  const file            = formData.get('file') as File | null

  if (!category || !entity_type || !file_name) {
    return { ok: false, error: 'Completa los campos obligatorios' }
  }

  let file_path: string | null = null

  if (file && file.size > 0) {
    const parts   = file.name.split('.')
    const ext     = parts.length > 1 ? parts.pop()! : 'bin'
    const safe    = file_name.replace(/[^a-zA-Z0-9_\-]/g, '_')
    const path    = `${category}/${entity_type}/${Date.now()}_${safe}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    const { error: storageError } = await supabase.storage
      .from('documentos')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream' })

    if (storageError) {
      console.error('[documentos-storage]', JSON.stringify(storageError))
      return { ok: false, error: `Storage: ${storageError.message}` }
    }

    file_path = path
  }

  const { error: dbError } = await supabase.from('documents').insert({
    category,
    entity_type,
    entity_id:       entity_id || null,
    file_path,
    file_name,
    expiration_date: expiration_date || null,
    notes:           notes || null,
  })

  if (dbError) {
    console.error('[documentos-db]', JSON.stringify(dbError))
    return { ok: false, error: `DB: ${dbError.message} (${dbError.code})` }
  }

  revalidatePath('/documentos', 'layout')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function eliminarDocumentoAction(
  id: string,
  file_path: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (file_path) {
    await supabase.storage.from('documentos').remove([file_path])
  }

  const { error } = await supabase.from('documents').delete().eq('id', id)

  if (error) {
    return { ok: false, error: `DB: ${error.message}` }
  }

  revalidatePath('/documentos', 'layout')
  revalidatePath('/', 'layout')
  return { ok: true }
}
