'use server'

import { supabase } from '@/lib/supabase'

export type TollRow = {
  status: string; type: string; document: string; plate: string; toll_name: string
  category: string; pass_date: string | null; subtotal: number; tax: number; total: number
  cufe: string; nit: string
}

export type DianRow = {
  document_type: string; cufe: string; folio: string; prefix: string
  issue_date: string | null; reception_date: string | null
  nit_issuer: string; name_issuer: string; nit_receiver: string; name_receiver: string
  iva: number; total: number; status: string
}

export type ImportResult =
  | { ok: true; inserted: number; duplicates: number }
  | { ok: false; error: string }

export type Toll = {
  id: string; status: string | null; type: string | null; document: string | null
  plate: string | null; toll_name: string | null; category: string | null
  pass_date: string | null; subtotal: number; tax: number; total: number
  cufe: string | null; nit: string | null; trip_id: string | null
}

export type DianInv = {
  id: string; document_type: string | null; cufe: string | null; folio: string | null
  issue_date: string | null; nit_issuer: string | null; name_issuer: string | null
  nit_receiver: string | null; name_receiver: string | null
  iva: number; total: number; status: string | null
}

export async function importarFlypassAction(rows: TollRow[]): Promise<ImportResult> {
  if (!rows.length) return { ok: true, inserted: 0, duplicates: 0 }

  const docs = rows.map(r => r.document).filter(d => d?.length > 0)
  let existingDocs = new Set<string>()

  if (docs.length > 0) {
    const { data: existing } = await supabase
      .from('toll_transactions').select('document').in('document', docs)
    existingDocs = new Set((existing ?? []).map(e => e.document as string))
  }

  const newRows = rows.filter(r => r.document && !existingDocs.has(r.document))

  if (newRows.length > 0) {
    const { error } = await supabase.from('toll_transactions').insert(newRows)
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, inserted: newRows.length, duplicates: rows.length - newRows.length }
}

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

export async function cruzarCufeAction(): Promise<{ ok: true; matched: number } | { ok: false; error: string }> {
  const { data: tolls, error: tollErr } = await supabase
    .from('toll_transactions').select('id, cufe')
    .not('cufe', 'is', null).neq('cufe', '')

  if (tollErr) return { ok: false, error: tollErr.message }
  if (!tolls?.length) return { ok: true, matched: 0 }

  const cufeList = tolls.map(t => t.cufe as string)

  const { data: invoices, error: invErr } = await supabase
    .from('dian_invoices_import').select('id, cufe').in('cufe', cufeList)

  if (invErr) return { ok: false, error: invErr.message }
  if (!invoices?.length) return { ok: true, matched: 0 }

  const cufeToToll = new Map(tolls.map(t => [t.cufe as string, t.id as string]))

  await Promise.all(
    invoices.map(inv => {
      const tollId = cufeToToll.get(inv.cufe as string)
      if (!tollId) return null
      return supabase.from('dian_invoices_import')
        .update({ matched_toll_id: tollId }).eq('id', inv.id)
    }).filter(Boolean)
  )

  return { ok: true, matched: invoices.length }
}

export async function getResultadosAction() {
  const [{ data: tolls }, { count: dianTotal }, { data: matchedDian }, { data: otrosGastos }] =
    await Promise.all([
      supabase.from('toll_transactions').select('*').order('pass_date', { ascending: false }),
      supabase.from('dian_invoices_import').select('*', { count: 'exact', head: true }),
      supabase.from('dian_invoices_import')
        .select('matched_toll_id').not('matched_toll_id', 'is', null),
      supabase.from('dian_invoices_import')
        .select('id,document_type,cufe,folio,issue_date,nit_issuer,name_issuer,nit_receiver,name_receiver,iva,total,status')
        .is('matched_toll_id', null)
        .order('issue_date', { ascending: false }),
    ])

  const matchedTollIds = new Set((matchedDian ?? []).map(d => d.matched_toll_id as string))
  const allTolls = (tolls ?? []) as Toll[]
  const sinFactura = allTolls.filter(t => !matchedTollIds.has(t.id))

  return {
    tolls:        allTolls,
    dianTotal:    dianTotal ?? 0,
    matched:      matchedDian?.length ?? 0,
    otrosGastos:  (otrosGastos ?? []) as DianInv[],
    sinFactura,
    sinFacturaIds: sinFactura.map(t => t.id),
  }
}

export type TollWithMatch = Toll & { tiene_factura: boolean }

export async function getTollsAction(): Promise<TollWithMatch[]> {
  const [{ data: tolls }, { data: dianCufes }] = await Promise.all([
    supabase.from('toll_transactions').select('*').order('pass_date', { ascending: false }),
    supabase.from('dian_invoices_import').select('cufe').not('cufe', 'is', null).neq('cufe', ''),
  ])
  const cufeSet = new Set((dianCufes ?? []).map(d => d.cufe as string))
  return ((tolls ?? []) as Toll[]).map(t => ({
    ...t,
    tiene_factura: !!(t.cufe && cufeSet.has(t.cufe)),
  }))
}

export async function asociarViajeAction(tollId: string, tripId: string | null) {
  const { error } = await supabase
    .from('toll_transactions')
    .update({ trip_id: tripId || null })
    .eq('id', tollId)
  return { ok: !error, error: error?.message }
}
