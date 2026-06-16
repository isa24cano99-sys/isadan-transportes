import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import BankDetailClient from './client'

async function getBankDetail(id: string) {
  const [{ data: account }, { data: transactions }, { data: customCats }] = await Promise.all([
    supabase.from('bank_accounts').select('*').eq('id', id).single(),
    supabase
      .from('bank_transactions')
      .select('*')
      .eq('account_id', id)
      .order('date', { ascending: false }),
    supabase.from('transaction_categories').select('id, name, type').order('name'),
  ])

  if (!account) return null

  const txns     = transactions ?? []
  const ingresos = txns.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egresos  = txns.filter(t => t.type === 'EGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const balance  = Number(account.initial_balance) + ingresos - egresos

  return { account, transactions: txns, ingresos, egresos, balance, customCategories: customCats ?? [] }
}

export default async function BankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getBankDetail(id)

  if (!data) notFound()

  return <BankDetailClient {...data} />
}
