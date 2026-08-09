import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import BankDetailClient from './client'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

export const dynamic = 'force-dynamic'

async function getBankDetail(id: string) {
  const [{ data: account }, { data: transactions }, { data: catsRaw }, { data: pucRaw }, { data: tripsRaw }, { data: asientosRaw }, { data: consolRaw }, { data: feRaw }] = await Promise.all([
    supabase.from('bank_accounts').select('*').eq('id', id).single(),
    supabase
      .from('bank_transactions')
      .select('*, transaction_categories(id, name, type, puc_code), dian_invoices_import(folio, name_issuer, terceros(razon_social))')
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
    // "Contabilizado" con el MISMO criterio que asientoContabilizadoDeTransaccion:
    // (a) asiento directo desde la transacción (origen_id). Orden created_at asc → gana el original.
    supabase
      .from('journal_entries')
      .select('origen_id, tipo_comprobante, consecutivo, created_at')
      .eq('origen_tabla', 'bank_transactions')
      .eq('estado', 'CONTABILIZADO')
      .order('created_at', { ascending: true }),
    // (b) dentro de un asiento CONSOLIDADO (tabla puente — no usa origen_id)
    supabase
      .from('gasto_consolidado_items')
      .select('bank_transaction_id, journal_entries!inner(tipo_comprobante, consecutivo, estado)')
      .eq('journal_entries.estado', 'CONTABILIZADO'),
    // (c) FE vinculada: el CG se posteó desde la factura DIAN
    supabase
      .from('journal_entries')
      .select('origen_id, tipo_comprobante, consecutivo')
      .eq('origen_tabla', 'dian_invoices_import')
      .eq('estado', 'CONTABILIZADO'),
  ])

  if (!account) return null

  // Mapa transacción → 'CB-N'/'CG-N', con el criterio unificado (directo ∪ consolidado ∪ FE)
  const asientoPorOrigen = new Map<string, string>()
  for (const a of asientosRaw ?? []) {
    if (a.origen_id && !asientoPorOrigen.has(a.origen_id)) {
      asientoPorOrigen.set(a.origen_id, `${a.tipo_comprobante}-${a.consecutivo}`)
    }
  }
  for (const c of consolRaw ?? []) {
    const je = (c as any).journal_entries
    if (c.bank_transaction_id && je && !asientoPorOrigen.has(c.bank_transaction_id)) {
      asientoPorOrigen.set(c.bank_transaction_id, `${je.tipo_comprobante}-${je.consecutivo}`)
    }
  }
  const asientoPorFactura = new Map<string, string>()
  for (const f of feRaw ?? []) {
    if (f.origen_id && !asientoPorFactura.has(f.origen_id)) {
      asientoPorFactura.set(f.origen_id, `${f.tipo_comprobante}-${f.consecutivo}`)
    }
  }

  const pucMap = new Map((pucRaw ?? []).map(p => [p.codigo, p.tipo]))
  const categories: TransactionCategory[] = (catsRaw ?? []).map(c => ({
    ...c,
    puc_tipo: c.puc_code ? (pucMap.get(c.puc_code) ?? undefined) : undefined,
  }))

  const txns     = (transactions ?? []).map(t => ({
    ...t,
    asiento_contable: asientoPorOrigen.get(t.id)
      ?? (t.matched_invoice_id ? asientoPorFactura.get(t.matched_invoice_id) ?? null : null),
  }))
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
