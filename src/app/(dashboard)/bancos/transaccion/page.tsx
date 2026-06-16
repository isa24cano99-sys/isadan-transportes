import { supabase } from '@/lib/supabase'
import TransaccionForm from './form'

async function getData() {
  const [accountsRes, customCatsRes] = await Promise.all([
    supabase.from('bank_accounts').select('id, bank_name').order('bank_name'),
    supabase.from('transaction_categories').select('id, name, type').order('name'),
  ])
  return {
    accounts:         accountsRes.data    ?? [],
    customCategories: customCatsRes.data  ?? [],
  }
}

export default async function TransaccionPage() {
  const { accounts, customCategories } = await getData()
  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nueva transacción</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Registra un ingreso o egreso bancario</p>
      </div>
      <TransaccionForm accounts={accounts} customCategories={customCategories} />
    </div>
  )
}
