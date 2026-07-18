import { supabase } from '@/lib/supabase'
import ProveedoresClient from './ProveedoresClient'
import { type MergedRow } from './actions'
import { isClientCategoria } from '@/lib/proveedores-utils'

export const dynamic = 'force-dynamic'

async function getMergedRows(): Promise<MergedRow[]> {
  const [{ data: supp }, { data: catalog }, { data: clients }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    // Nota: supplier_catalog no tiene columna `keywords`; se seleccionan solo las existentes.
    supabase.from('supplier_catalog').select('id, nit, nombre, categoria, cuenta_puc'),
    supabase.from('clients').select('nit'),
  ])

  const clientNits = new Set(
    (clients ?? []).map(c => c.nit).filter(Boolean) as string[],
  )

  const byKey = new Map<string, MergedRow>()
  const keyFor = (nit: string | null, fallback: string) => (nit ? `nit:${nit}` : fallback)

  for (const s of (supp ?? []) as any[]) {
    const key = keyFor(s.nit ?? null, `sup:${s.id}`)
    byKey.set(key, {
      key,
      supplier_id:       s.id,
      catalog_id:        null,
      nit:               s.nit ?? null,
      name:              s.name ?? '(sin nombre)',
      categoria:         null,
      is_client:         false,
      exists_in_clients: s.nit ? clientNits.has(s.nit) : false,
      category:          s.category ?? null,
      account_code:      s.account_code ?? null,
      email:             s.email ?? null,
      phone:             s.phone ?? null,
      dataico_id:        s.dataico_id ?? null,
      updated_at:        s.updated_at ?? null,
      cuenta_puc:        null,
    })
  }

  for (const c of (catalog ?? []) as any[]) {
    const key = keyFor(c.nit ?? null, `cat:${c.id}`)
    const existing = byKey.get(key)
    if (existing) {
      existing.catalog_id = c.id
      existing.categoria  = c.categoria ?? null
      existing.is_client  = isClientCategoria(c.categoria)
      existing.cuenta_puc = c.cuenta_puc ?? null
      if (!existing.name || existing.name === '(sin nombre)') existing.name = c.nombre ?? existing.name
    } else {
      byKey.set(key, {
        key,
        supplier_id:       null,
        catalog_id:        c.id,
        nit:               c.nit ?? null,
        name:              c.nombre ?? '(sin nombre)',
        categoria:         c.categoria ?? null,
        is_client:         isClientCategoria(c.categoria),
        exists_in_clients: c.nit ? clientNits.has(c.nit) : false,
        category:          null,
        account_code:      null,
        email:             null,
        phone:             null,
        dataico_id:        null,
        updated_at:        null,
        cuenta_puc:        c.cuenta_puc ?? null,
      })
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export default async function ProveedoresPage() {
  const rows = await getMergedRows()
  return <ProveedoresClient initial={rows} />
}
