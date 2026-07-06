'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { normalizarDescripcion, categorizarPorReglas } from '@/lib/transaction-categorizer'

export type TransactionCategory = {
  id: string
  name: string
  description: string | null
  puc_code: string | null
  type: 'NEGOCIO' | 'CASA'
  active: boolean
  puc_tipo?: string
}

export type SupplierResult = {
  id: string
  nit: string | null
  nombre: string
}

export async function buscarProveedoresAction(query: string): Promise<SupplierResult[]> {
  if (query.trim().length < 2) return []
  const q = query.trim()
  const { data } = await supabase
    .from('supplier_catalog')
    .select('id, nit, nombre')
    .or(`nombre.ilike.%${q}%,nit.ilike.%${q}%`)
    .limit(10)
  return (data ?? []) as SupplierResult[]
}

export async function crearProveedorAction(
  formData: FormData,
): Promise<{ ok: boolean; supplier?: SupplierResult; error?: string }> {
  const nit    = (formData.get('nit') as string)?.trim() || null
  const nombre = (formData.get('nombre') as string)?.trim()
  if (!nombre) return { ok: false, error: 'Nombre requerido' }
  const { data, error } = await supabase
    .from('supplier_catalog')
    .insert({ nit, nombre })
    .select('id, nit, nombre')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, supplier: data as SupplierResult }
}

export async function crearCategoriaAction(
  formData: FormData,
): Promise<{ ok: boolean; category?: TransactionCategory; error?: string }> {
  const name        = (formData.get('name') as string)?.trim()
  const type        = formData.get('type') as 'NEGOCIO' | 'CASA'
  const puc_code    = (formData.get('puc_code') as string) || null
  const description = (formData.get('description') as string) || null

  if (!name || !type) return { ok: false, error: 'Nombre y tipo son requeridos' }

  const { data, error } = await supabase
    .from('transaction_categories')
    .insert({ name, type, puc_code, description, active: true })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos', 'layout')
  return { ok: true, category: data as TransactionCategory }
}

export type SugerirResult = {
  categoryId:   string
  categoryName: string
  categoryType: 'NEGOCIO' | 'CASA'
  source:       'RULES' | 'PATTERNS'
  supplierNit?: string | null
  supplierName?: string | null
}

export async function sugerirCategoriaAction(
  descripcion: string,
): Promise<SugerirResult | null> {
  if (descripcion.length < 4) return null

  // 1. Reglas fijas
  const ruleName = categorizarPorReglas(descripcion)
  if (ruleName) {
    const { data: cat } = await supabase
      .from('transaction_categories')
      .select('id, name, type')
      .ilike('name', ruleName)
      .eq('active', true)
      .maybeSingle()
    if (cat) return { categoryId: cat.id, categoryName: cat.name, categoryType: cat.type as 'NEGOCIO' | 'CASA', source: 'RULES' }
  }

  // 2. Patrones aprendidos
  const { data: patterns } = await supabase
    .from('description_patterns')
    .select('pattern, category_id, supplier_nit, supplier_name, transaction_categories(id, name, type)')
    .order('match_count', { ascending: false })
    .limit(200)

  if (patterns?.length) {
    const normed = normalizarDescripcion(descripcion)
    const match = patterns.find(p => normed.includes(p.pattern))
    if (match) {
      const cat = match.transaction_categories as unknown as { id: string; name: string; type: string } | null
      if (cat) return {
        categoryId:   cat.id,
        categoryName: cat.name,
        categoryType: cat.type as 'NEGOCIO' | 'CASA',
        source:       'PATTERNS',
        supplierNit:  (match as any).supplier_nit as string | null ?? null,
        supplierName: (match as any).supplier_name as string | null ?? null,
      }
    }
  }

  return null
}

export async function recategorizarAction(
  accountId: string,
): Promise<{ ok: boolean; categorized: number; skipped: number; error?: string }> {
  const [{ data: txns, error: txErr }, { data: cats }, { data: patterns }] = await Promise.all([
    supabase
      .from('bank_transactions')
      .select('id, description, type')
      .eq('account_id', accountId)
      .is('category_id', null),
    supabase
      .from('transaction_categories')
      .select('id, name')
      .eq('active', true),
    supabase
      .from('description_patterns')
      .select('pattern, category_id')
      .order('match_count', { ascending: false })
      .limit(500),
  ])

  if (txErr) return { ok: false, categorized: 0, skipped: 0, error: txErr.message }
  if (!txns?.length) return { ok: true, categorized: 0, skipped: 0 }

  const catByName = new Map((cats ?? []).map(c => [c.name.toLowerCase(), c.id]))
  const updates: any[] = []
  let categorized = 0

  for (const tx of txns) {
    const desc = tx.description ?? ''

    // Try rules
    const ruleName = categorizarPorReglas(desc)
    if (ruleName) {
      const catId = catByName.get(ruleName.toLowerCase())
      if (catId) {
        updates.push(supabase.from('bank_transactions').update({ category_id: catId }).eq('id', tx.id))
        categorized++
        continue
      }
    }

    // Try patterns
    const normed = normalizarDescripcion(desc)
    const match = (patterns ?? []).find(p => normed.includes(p.pattern))
    if (match?.category_id) {
      updates.push(supabase.from('bank_transactions').update({ category_id: match.category_id }).eq('id', tx.id))
      categorized++
    }
  }

  await Promise.all(updates)
  revalidatePath('/bancos', 'layout')
  return { ok: true, categorized, skipped: (txns?.length ?? 0) - categorized }
}

// ── Migración de campo category (texto) → category_id ───────────────────────

const KEYWORD_TO_NAME: Record<string, string> = {
  PEAJES:               'Peajes operación',
  GMF:                  'GMF 4x1000',
  IMPTO_GOBIERNO:       'GMF 4x1000',
  INTERESES_BANCARIOS:  'Intereses bancarios recibidos',
  SEGUROS:              'Seguros vehículos',
  SEGURIDAD_SOCIAL:     'Seguridad social',
}

export async function migrarCategoriasAction(): Promise<{ ok: boolean; updated: number; error?: string }> {
  const { data: txns, error: txErr } = await supabase
    .from('bank_transactions')
    .select('id, category')
    .is('category_id', null)
    .not('category', 'is', null)
    .neq('category', '')

  if (txErr) return { ok: false, updated: 0, error: txErr.message }
  if (!txns?.length) return { ok: true, updated: 0 }

  const { data: cats } = await supabase
    .from('transaction_categories')
    .select('id, name, puc_code')
    .eq('active', true)

  const pucToId  = new Map<string, string>()
  const nameToId = new Map<string, string>()
  for (const c of cats ?? []) {
    if (c.puc_code) pucToId.set(c.puc_code, c.id)
    if (c.name)     nameToId.set(c.name.toLowerCase().trim(), c.id)
  }

  const updates: any[] = []
  let updated = 0

  for (const tx of txns) {
    const raw = (tx.category as string | null)?.trim() ?? ''
    if (!raw) continue
    let catId = pucToId.get(raw)
    if (!catId) {
      const targetName = KEYWORD_TO_NAME[raw]
      if (targetName) catId = nameToId.get(targetName.toLowerCase().trim())
    }
    if (catId) {
      updates.push(supabase.from('bank_transactions').update({ category_id: catId }).eq('id', tx.id))
      updated++
    }
  }

  await Promise.all(updates)
  revalidatePath('/bancos', 'layout')
  return { ok: true, updated }
}

/**
 * Sync puc_code values in transaction_categories to codes that actually exist
 * in puc_accounts. For each category whose code has no match, tries progressively
 * shorter prefixes until one puc_account is found.
 */
export async function sincronizarPucCodesAction(): Promise<{
  ok: boolean
  changed: Array<{ categoryName: string; oldCode: string; newCode: string }>
  unmatched: Array<{ categoryName: string; oldCode: string }>
  error?: string
}> {
  const [{ data: cats, error: catErr }, { data: pucs }] = await Promise.all([
    supabase
      .from('transaction_categories')
      .select('id, name, puc_code')
      .not('puc_code', 'is', null),
    supabase
      .from('puc_accounts')
      .select('id, codigo, nombre')
      .eq('active', true),
  ])

  if (catErr) return { ok: false, changed: [], unmatched: [], error: catErr.message }

  const validCodes = new Set((pucs ?? []).map(p => p.codigo))
  const pucList    = pucs ?? []

  const changed:   Array<{ categoryName: string; oldCode: string; newCode: string }> = []
  const unmatched: Array<{ categoryName: string; oldCode: string }> = []

  for (const cat of (cats ?? [])) {
    if (!cat.puc_code) continue
    if (validCodes.has(cat.puc_code)) continue // already valid

    // Try progressively shorter prefix matches (prefer most-specific match)
    let match: string | null = null
    const maxLen = Math.min(cat.puc_code.length, 10)
    for (let len = maxLen; len >= 4; len--) {
      const prefix = cat.puc_code.slice(0, len)
      const candidates = pucList.filter(p => p.codigo.startsWith(prefix))
      if (candidates.length > 0) {
        match = candidates.sort((a, b) => a.codigo.length - b.codigo.length)[0].codigo
        break
      }
    }

    if (match) {
      await supabase.from('transaction_categories').update({ puc_code: match }).eq('id', cat.id)
      changed.push({ categoryName: cat.name, oldCode: cat.puc_code, newCode: match })
    } else {
      unmatched.push({ categoryName: cat.name, oldCode: cat.puc_code })
    }
  }

  if (changed.length > 0) revalidatePath('/bancos', 'layout')

  return { ok: true, changed, unmatched }
}

export async function checkUnmigrated(): Promise<number> {
  const { count } = await supabase
    .from('bank_transactions')
    .select('id', { count: 'exact', head: true })
    .is('category_id', null)
    .not('category', 'is', null)
    .neq('category', '')
  return count ?? 0
}
