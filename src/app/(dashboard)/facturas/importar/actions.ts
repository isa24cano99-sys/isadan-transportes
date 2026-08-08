'use server'

import { supabase } from '@/lib/supabase'
import type { DianRow } from '@/lib/dian-xlsx'

export type { DianRow }

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
