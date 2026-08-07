'use server'

/*
  ⚠ HISTÓRICO — la fuente de verdad del esquema es supabase/migrations/ (ver README → Migraciones).
     Se conserva solo como referencia; NO ejecutar a mano.

  SQL — run once in Supabase SQL Editor to enable keyword-based categorisation:

  ALTER TABLE supplier_catalog ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}';
  ALTER TABLE supplier_catalog ADD COLUMN IF NOT EXISTS cuenta_puc text;
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

// Varias actions de escritura quedaron DESHABILITADAS (solo lectura): la gestión de
// proveedores/clientes se hace ahora desde /terceros. Escribían directo a suppliers/
// supplier_catalog/clients SIN pasar por terceros. Se conservan pero con early-return.
const DESHABILITADO = 'Deshabilitado — la gestión de proveedores/clientes ahora se hace desde /terceros'

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

export async function sincronizarProveedoresAction(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: DESHABILITADO }
}

export async function actualizarProveedorAction(
  _id: string,
  _data: { name: string; category: string | null; account_code: string | null },
): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: DESHABILITADO }
}

export async function eliminarProveedorAction(_id: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: DESHABILITADO }
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
  _nit: string | null,
  _name: string,
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  return { ok: false, created: false, error: DESHABILITADO }
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
