import { supabase } from '@/lib/supabase'
import ProveedoresClient from './ProveedoresClient'
import { type Supplier } from './actions'

async function getSuppliers(): Promise<Supplier[]> {
  const [{ data: suppData }, { data: catalogData }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('supplier_catalog').select('nit, keywords, cuenta_puc'),
  ])

  const catalogByNit = new Map(
    (catalogData ?? [])
      .filter(c => c.nit)
      .map(c => [c.nit as string, c]),
  )

  return (suppData ?? []).map(s => ({
    ...s,
    keywords:   (catalogByNit.get(s.nit ?? '')?.keywords  as string[] | undefined) ?? [],
    cuenta_puc: (catalogByNit.get(s.nit ?? '')?.cuenta_puc as string | null | undefined) ?? null,
  })) as Supplier[]
}

export default async function ProveedoresPage() {
  const suppliers = await getSuppliers()
  return <ProveedoresClient initial={suppliers} />
}
