import { supabase } from '@/lib/supabase'
import ConciliacionClient, { type ReconciliacionRow, type AccountLite } from './ConciliacionClient'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

export const dynamic = 'force-dynamic'

export default async function ConciliacionPage() {
  const [catsRes, pucRes, accRes, recRes, minRes, maxRes] = await Promise.all([
    supabase
      .from('transaction_categories')
      .select('id, name, description, puc_code, type, active')
      .eq('active', true).order('type').order('name'),
    supabase
      .from('puc_accounts')
      .select('id, codigo, nombre, tipo, active').order('tipo').order('codigo'),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number, initial_balance').order('bank_name'),
    supabase
      .from('bank_reconciliations')
      .select('*').order('year', { ascending: false }).order('month', { ascending: false }),
    supabase
      .from('bank_transactions').select('date').order('date', { ascending: true }).limit(1),
    supabase
      .from('bank_transactions').select('date').order('date', { ascending: false }).limit(1),
  ])

  const pucMap = new Map((pucRes.data ?? []).map((p: any) => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRes.data ?? []).map((c: any) => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  const accounts: AccountLite[] = (accRes.data ?? []).map((a: any) => ({
    id: a.id, bank_name: a.bank_name, account_number: a.account_number ?? null,
  }))

  const reconciliations: ReconciliacionRow[] = (recRes.data ?? []).map((r: any) => ({
    id:                r.id,
    accountId:         r.account_id,
    year:              r.year,
    month:             r.month,
    status:            r.status,
    saldoInicial:      Number(r.extracto_saldo_inicial ?? 0),
    totalIngresos:     Number(r.extracto_total_ingresos ?? 0),
    totalEgresos:      Number(r.extracto_total_egresos ?? 0),
    saldoFinal:        Number(r.extracto_saldo_final ?? 0),
    appSaldoFinal:     Number(r.app_saldo_final ?? 0),
    diferencia:        Number(r.diferencia ?? 0),
    conciliadas:       Number(r.transacciones_conciliadas ?? 0),
    sinRegistrar:      Number(r.transacciones_sin_registrar ?? 0),
    sinConfirmar:      Number(r.transacciones_sin_confirmar ?? 0),
    closedAt:          r.closed_at ?? null,
  }))

  const minDate = minRes.data?.[0]?.date ?? null
  const maxDate = maxRes.data?.[0]?.date ?? null

  return (
    <ConciliacionClient
      categories={categories}
      pucAccounts={(pucRes.data ?? []) as any}
      accounts={accounts}
      reconciliations={reconciliations}
      minDate={minDate}
      maxDate={maxDate}
    />
  )
}
