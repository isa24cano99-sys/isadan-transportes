'use server'

/*
  ⚠ HISTÓRICO — la fuente de verdad del esquema es supabase/migrations/ (ver README → Migraciones).
     Se conserva solo como referencia; NO ejecutar a mano.

  SQL — run once in Supabase SQL Editor to enable keyword-based categorisation:

  ALTER TABLE supplier_catalog ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}';
  ALTER TABLE supplier_catalog ADD COLUMN IF NOT EXISTS cuenta_puc text;
*/

import { supabase } from '@/lib/supabase'
import { getDataicoCustomers } from '@/lib/dataico'
import { revalidatePath } from 'next/cache'

export type Supplier = {
  id: string
  dataico_id: string | null
  nit: string | null
  name: string
  category: string | null
  account_code: string | null
  email: string | null
  phone: string | null
  active: boolean
  updated_at: string
  keywords?: string[]
  cuenta_puc?: string | null
}

/**
 * Fila unificada por NIT que fusiona `suppliers` y `supplier_catalog`.
 * - `supplier_id` presente → existe en suppliers (permite editar/eliminar proveedor).
 * - `catalog_id` presente → existe en supplier_catalog (permite categorizar / mover a clientes).
 * - `is_client` → la categoría del catálogo empieza por 'CLIENTE'.
 * - `exists_in_clients` → el NIT ya existe en la tabla `clients`.
 */
export type MergedRow = {
  key:               string
  supplier_id:       string | null
  catalog_id:        string | null
  nit:               string | null
  name:              string
  categoria:         string | null   // supplier_catalog.categoria
  is_client:         boolean
  exists_in_clients: boolean
  // Campos de suppliers (cuando supplier_id != null)
  category:          string | null   // party_type
  account_code:      string | null
  email:             string | null
  phone:             string | null
  dataico_id:        string | null
  updated_at:        string | null
  cuenta_puc:        string | null
}

export async function sincronizarProveedoresAction() {
  // 1. Unique (nit_issuer, name_issuer) from DIAN imports
  const { data: dianRows, error: dianErr } = await supabase
    .from('dian_invoices_import')
    .select('nit_issuer, name_issuer')
    .not('nit_issuer', 'is', null)
    .neq('nit_issuer', '')

  if (dianErr) return { ok: false, error: dianErr.message }

  const uniqueMap = new Map<string, string>()
  for (const r of (dianRows ?? [])) {
    if (r.nit_issuer && !uniqueMap.has(r.nit_issuer)) {
      uniqueMap.set(r.nit_issuer, r.name_issuer ?? '')
    }
  }

  if (uniqueMap.size === 0) {
    return { ok: true, inserted: 0, updated: 0, message: 'No hay facturas DIAN importadas con NIT emisor.' }
  }

  // 2. Dataico customers for cross-reference (enrichment)
  let dataicoMap = new Map<string, Awaited<ReturnType<typeof getDataicoCustomers>>[number]>()
  try {
    const customers = await getDataicoCustomers()
    dataicoMap = new Map(customers.map(c => [c.party_identification, c]))
  } catch {
    // Non-fatal — continue without Dataico enrichment
  }

  // 3. Build rows
  const rows = [...uniqueMap.entries()].map(([nit, nameFromDian]) => {
    const dc = dataicoMap.get(nit)
    return {
      nit,
      name:       dc?.company_name ?? nameFromDian,
      dataico_id: dc?.id           ?? null,
      email:      dc?.email        ?? null,
      phone:      dc?.phone        ?? null,
      category:   dc?.party_type   ?? null,
      active:     true,
      updated_at: new Date().toISOString(),
    }
  })

  // 4. Check existing suppliers by NIT
  const { data: existing } = await supabase.from('suppliers').select('nit, id')
  const existingNits = new Map((existing ?? []).map(e => [e.nit, e.id as string]))

  const toInsert = rows.filter(r => !existingNits.has(r.nit))
  const toUpdate = rows.filter(r => existingNits.has(r.nit))

  if (toInsert.length > 0) {
    const { error } = await supabase.from('suppliers').insert(toInsert)
    if (error) return { ok: false, error: error.message }
  }

  for (const row of toUpdate) {
    await supabase.from('suppliers').update(row).eq('nit', row.nit)
  }

  revalidatePath('/proveedores')
  return {
    ok: true,
    inserted: toInsert.length,
    updated:  toUpdate.length,
    enriched: [...uniqueMap.keys()].filter(nit => dataicoMap.has(nit)).length,
  }
}

export async function actualizarProveedorAction(
  id: string,
  data: { name: string; category: string | null; account_code: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('suppliers').update(data).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/proveedores')
  return { ok: true }
}

export async function eliminarProveedorAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/proveedores')
  return { ok: true }
}

/**
 * Upsert keywords and cuenta_puc into supplier_catalog for the given supplier.
 * The cuenta_puc value must match a puc_code in transaction_categories for
 * auto-categorisation to work.
 */
export async function actualizarKeywordsAction(
  supplierId: string,
  keywords: string[],
  cuenta_puc: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: sup, error: supErr } = await supabase
    .from('suppliers')
    .select('nit, name')
    .eq('id', supplierId)
    .single()

  if (supErr || !sup) return { ok: false, error: 'Proveedor no encontrado' }
  if (!sup.nit) return { ok: false, error: 'El proveedor no tiene NIT registrado' }

  const cleanKws = keywords.map(k => k.trim().toLowerCase()).filter(Boolean)

  const { error } = await supabase
    .from('supplier_catalog')
    .upsert(
      { nit: sup.nit, nombre: sup.name, keywords: cleanKws, cuenta_puc: cuenta_puc || null },
      { onConflict: 'nit' },
    )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getProveedoresAction() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name')
  if (error) return { ok: false as const, error: error.message, data: [] as Supplier[] }
  return { ok: true as const, data: (data ?? []) as Supplier[] }
}

/**
 * Mueve un registro (cliente mal clasificado como proveedor) a la tabla `clients`.
 * Busca por NIT: si ya existe no duplica; si no, lo crea con nombre y NIT.
 * NO elimina del catálogo — eso se confirma aparte con `eliminarDeCatalogoAction`.
 */
export async function moverAClienteAction(
  nit: string | null,
  name: string,
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  if (!nit) return { ok: false, created: false, error: 'El registro no tiene NIT.' }

  const { data: existing, error: selErr } = await supabase
    .from('clients').select('id').eq('nit', nit).maybeSingle()
  if (selErr) {
    console.error('[moverACliente] consulta clients:', selErr.message)
    return { ok: false, created: false, error: selErr.message }
  }
  if (existing) return { ok: true, created: false } // ya existe como cliente

  const { error: insErr } = await supabase
    .from('clients').insert({ name, nit, active: true })
  if (insErr) {
    console.error('[moverACliente] insert clients:', insErr.message)
    return { ok: false, created: false, error: insErr.message }
  }

  revalidatePath('/proveedores')
  revalidatePath('/clientes')
  return { ok: true, created: true }
}

/** Elimina una entrada de `supplier_catalog` por id (paso de confirmación tras mover a clientes). */
export async function eliminarDeCatalogoAction(
  catalogId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('supplier_catalog').delete().eq('id', catalogId)
  if (error) {
    console.error('[eliminarDeCatalogo]:', error.message)
    return { ok: false, error: error.message }
  }
  revalidatePath('/proveedores')
  return { ok: true }
}
