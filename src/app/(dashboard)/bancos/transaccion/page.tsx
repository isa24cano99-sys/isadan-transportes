import { supabase } from '@/lib/supabase'
import TransaccionForm from './form'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

async function getData() {
  const [accountsRes, catsRes, pucRes, tripsRes] = await Promise.all([
    supabase.from('bank_accounts').select('id, bank_name').order('bank_name'),
    supabase
      .from('transaction_categories')
      .select('id, name, description, puc_code, type, active')
      .eq('active', true)
      .order('type')
      .order('name'),
    supabase.from('puc_accounts').select('id, codigo, nombre, tipo, active').order('tipo').order('codigo'),
    supabase
      .from('trips')
      .select('id, trip_number, origin, destination, load_date, vehicles(plate)')
      .order('created_at', { ascending: false }),
  ])

  const pucMap = new Map((pucRes.data ?? []).map(p => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRes.data ?? []).map(c => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  return {
    accounts:    accountsRes.data ?? [],
    categories,
    pucAccounts: pucRes.data      ?? [],
    trips:       tripsRes.data    ?? [],
  }
}

export default async function TransaccionPage() {
  const { accounts, categories, pucAccounts, trips } = await getData()
  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nueva transacción</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Registra un ingreso o egreso bancario</p>
      </div>
      <TransaccionForm
        accounts={accounts}
        categories={categories}
        pucAccounts={pucAccounts as any}
        trips={trips as any}
      />
    </div>
  )
}
