import { supabase } from '@/lib/supabase'
import ConciliacionClient from './ConciliacionClient'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

export const dynamic = 'force-dynamic'

export default async function ConciliacionPage() {
  const [catsRes, pucRes] = await Promise.all([
    supabase
      .from('transaction_categories')
      .select('id, name, description, puc_code, type, active')
      .eq('active', true)
      .order('type')
      .order('name'),
    supabase
      .from('puc_accounts')
      .select('id, codigo, nombre, tipo, active')
      .order('tipo')
      .order('codigo'),
  ])

  const pucMap = new Map((pucRes.data ?? []).map((p: any) => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRes.data ?? []).map((c: any) => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  return (
    <ConciliacionClient
      categories={categories}
      pucAccounts={(pucRes.data ?? []) as any}
    />
  )
}
