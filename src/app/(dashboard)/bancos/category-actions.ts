'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { normalizarDescripcion, categorizarPorReglas, buscarPorProveedor } from '@/lib/transaction-categorizer'
import { resolverTerceroPorNitCrudo } from '@/lib/terceros'
import { normalizarIdentificacion } from '@/lib/nit'

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
  id: string             // terceros.id (= tercero_id)
  nit: string | null     // numero_identificacion base (sin DV pegado)
  nombre: string
  es_cliente: boolean
  es_proveedor: boolean
}

/**
 * Busca terceros (catálogo maestro unificado) por NIT o nombre. Un movimiento
 * bancario puede ser con un cliente, un proveedor, o un tercero que es ambos, así
 * que devuelve es_cliente/es_proveedor para que el selector pinte el badge correcto.
 * Excluye los fusionados (merged_into IS NOT NULL). No modifica ninguna tabla.
 */
export async function buscarProveedoresAction(query: string): Promise<SupplierResult[]> {
  if (query.trim().length < 2) return []
  const q = query.trim()
  const { data } = await supabase
    .from('terceros')
    .select('id, numero_identificacion, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona, es_cliente, es_proveedor')
    .is('merged_into', null)
    .or([
      `numero_identificacion.ilike.%${q}%`,
      `razon_social.ilike.%${q}%`,
      `primer_nombre.ilike.%${q}%`,
      `primer_apellido.ilike.%${q}%`,
      `segundo_apellido.ilike.%${q}%`,
      `otros_nombres.ilike.%${q}%`,
    ].join(','))
    .limit(10)

  return (data ?? []).map((t: any) => ({
    id: t.id,
    nit: t.numero_identificacion ?? null,
    nombre: t.tipo_persona === 'NATURAL'
      ? [t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido].filter(Boolean).join(' ')
      : (t.razon_social ?? ''),
    es_cliente:   !!t.es_cliente,
    es_proveedor: !!t.es_proveedor,
  }))
}

/**
 * Crea un tercero nuevo. Según `tipo` lo guarda en la tabla correcta:
 * CLIENTE → `clients`; PROVEEDOR → `supplier_catalog`.
 */
export async function crearProveedorAction(
  formData: FormData,
): Promise<{ ok: boolean; supplier?: SupplierResult; error?: string; warning?: string }> {
  const nitRaw = (formData.get('nit') as string)?.trim() || null
  const nombre = (formData.get('nombre') as string)?.trim()
  const tipo   = (formData.get('tipo') as 'CLIENTE' | 'PROVEEDOR') || 'PROVEEDOR'
  if (!nombre) return { ok: false, error: 'Nombre requerido' }

  // Normalizar el NIT (separa el DV pegado) y registrar/enlazar el tercero maestro.
  // Mismo blindaje anti-duplicados que la carga de manifiestos. Best-effort: si el
  // resolver falla, no bloquea la creación del registro legado, pero deja un warning
  // VISIBLE (el registro queda sin tercero_id → hay que enlazarlo a mano después).
  let nit = nitRaw
  let terceroId: string | null = null
  let warning: string | null = null
  if (nitRaw) {
    try {
      const r = await resolverTerceroPorNitCrudo(nitRaw, { nombre, rol: tipo })
      nit = r.base
      terceroId = r.terceroId
    } catch (e: any) {
      console.warn('[TERCERO/BANCO] no se pudo resolver el tercero:', e.message)
      nit = normalizarIdentificacion(nitRaw) || null
      warning = `"${nombre}" se creó, pero el NIT "${nitRaw}" no se pudo registrar en el catálogo de terceros (${e.message}). Quedó SIN enlace — búscalo en Terceros y enlázalo a mano.`
    }
  } else {
    warning = `"${nombre}" se creó sin NIT, así que no quedó enlazado al catálogo de terceros.`
  }

  if (tipo === 'CLIENTE') {
    const { data, error } = await supabase
      .from('clients')
      .insert({ name: nombre, nit, active: true, tercero_id: terceroId })
      .select('id, nit, name')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, supplier: { id: terceroId ?? data.id, nit: data.nit ?? null, nombre: data.name, es_cliente: true, es_proveedor: false }, ...(warning ? { warning } : {}) }
  }

  const { data, error } = await supabase
    .from('supplier_catalog')
    .insert({ nit, nombre, tercero_id: terceroId })
    .select('id, nit, nombre')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, supplier: { id: terceroId ?? data.id, nit: data.nit ?? null, nombre: data.nombre, es_cliente: false, es_proveedor: true }, ...(warning ? { warning } : {}) }
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
  source:       'RULES' | 'PROVEEDOR' | 'PATTERNS'
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

  // 2. Catálogo de proveedores con keywords
  const provMatch = await buscarPorProveedor(descripcion, supabase)
  if (provMatch) {
    return {
      categoryId:   provMatch.category.id,
      categoryName: provMatch.category.name,
      categoryType: provMatch.category.type as 'NEGOCIO' | 'CASA',
      source:       'PROVEEDOR',
      supplierName: provMatch.supplier_name,
    }
  }

  // 3. Patrones aprendidos
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
