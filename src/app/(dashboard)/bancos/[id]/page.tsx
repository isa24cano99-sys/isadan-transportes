import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import BankDetailClient from './client'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

export const dynamic = 'force-dynamic'

async function getBankDetail(id: string) {
  const [{ data: account }, { data: transactions }, { data: catsRaw }, { data: pucRaw }, { data: tripsRaw }] = await Promise.all([
    supabase.from('bank_accounts').select('*').eq('id', id).single(),
    supabase
      .from('bank_transactions')
      .select('*, transaction_categories(id, name, type, puc_code)')
      .eq('account_id', id)
      .order('date', { ascending: false }),
    supabase
      .from('transaction_categories')
      .select('id, name, description, puc_code, type, active')
      .eq('active', true)
      .order('type')
      .order('name'),
    supabase.from('puc_accounts').select('id, codigo, nombre, tipo, active').order('tipo').order('codigo'),
    supabase.from('trips').select('id, trip_number, manifest_number, origin, destination, load_date, vehicles(plate)').order('created_at', { ascending: false }),
  ])

  if (!account) return null

  const pucMap = new Map((pucRaw ?? []).map(p => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRaw ?? []).map(c => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  const txns     = transactions ?? []
  const ingresos = txns.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egresos  = txns.filter(t => t.type === 'EGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const balance  = Number(account.initial_balance) + ingresos - egresos

  return { account, transactions: txns, ingresos, egresos, balance, categories, pucAccounts: pucRaw ?? [], trips: tripsRaw ?? [] }
}

export default async function BankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getBankDetail(id)

  if (!data) notFound()

  return <BankDetailClient {...data as any} />
}
