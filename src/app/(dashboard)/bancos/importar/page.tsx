import { supabase } from '@/lib/supabase'
import ImportarExtractoClient from './client'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

export default async function ImportarExtractoPage() {
  const [catsRes, pucRes] = await Promise.all([
    supabase
      .from('transaction_categories')
      .select('id, name, description, puc_code, type, active')
      .eq('active', true)
      .order('type')
      .order('name'),
    supabase.from('puc_accounts').select('id, codigo, nombre, tipo, active').order('tipo').order('codigo'),
  ])

  const pucMap = new Map((pucRes.data ?? []).map(p => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRes.data ?? []).map(c => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  return (
    <ImportarExtractoClient
      categories={categories}
      pucAccounts={(pucRes.data ?? []) as any}
    />
  )
}
