import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import BancosClient from './client'

export const dynamic = 'force-dynamic'

async function getBankData() {
  const [{ data: accounts }, transactions] = await Promise.all([
    supabase.from('bank_accounts').select('*').order('bank_name'),
    // Paginado: bank_transactions ya pasa de 1000 → una consulta simple truncaría el saldo.
    fetchAll<{ account_id: string; type: string; amount: number }>((from, to) =>
      supabase.from('bank_transactions').select('account_id, type, amount').order('id', { ascending: true }).range(from, to)),
  ])
  const accs = accounts ?? []
  const txns = transactions
  return accs.map(acc => {
    const mine = txns.filter(t => t.account_id === acc.id)
    const ingresos = mine.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
    const egresos  = mine.filter(t => t.type === 'EGRESO').reduce((s, t) => s + Number(t.amount), 0)
    return { ...acc, ingresos, egresos, balance: Number(acc.initial_balance) + ingresos - egresos }
  })
}

export default async function BancosPage() {
  const accounts = await getBankData()
  return <BancosClient accounts={accounts} />
}
