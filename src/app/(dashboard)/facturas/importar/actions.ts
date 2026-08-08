'use server'

import { supabase } from '@/lib/supabase'

export type DianRow = {
  document_type: string; cufe: string; folio: string; prefix: string
  issue_date: string | null; reception_date: string | null
  nit_issuer: string; name_issuer: string; nit_receiver: string; name_receiver: string
  iva: number; total: number; status: string
}

export type ImportResult =
  | { ok: true; inserted: number; duplicates: number }
  | { ok: false; error: string }

export async function importarDianAction(rows: DianRow[]): Promise<ImportResult> {
  if (!rows.length) return { ok: true, inserted: 0, duplicates: 0 }

  const cufes = rows.map(r => r.cufe).filter(c => c?.length > 0)
  let existingCufes = new Set<string>()

  if (cufes.length > 0) {
    const { data: existing } = await supabase
      .from('dian_invoices_import').select('cufe').in('cufe', cufes)
    existingCufes = new Set((existing ?? []).map(e => e.cufe as string))
  }

  const newRows = rows.filter(r => r.cufe && !existingCufes.has(r.cufe))

  if (newRows.length > 0) {
    const { error } = await supabase.from('dian_invoices_import').insert(newRows)
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, inserted: newRows.length, duplicates: rows.length - newRows.length }
}
