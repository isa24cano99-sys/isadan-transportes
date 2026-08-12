'use server'

import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

function parseAmount(raw: string | number | null): number {
  if (raw === null || raw === undefined || raw === '') return 0
  return parseFloat(String(raw).replace(/,/g, '').trim()) || 0
}

function findYear(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    for (const cell of (rows[i] ?? [])) {
      if (!cell) continue
      const m = String(cell).trim().match(/(\d{4})[\/\-]\d{1,2}[\/\-]\d{1,2}/)
      if (m) { const y = parseInt(m[1]); if (y >= 2020 && y <= 2035) return y }
    }
  }
  return new Date().getFullYear()
}

function findAccountNumber(rows: (string | number | null)[][]): string {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    for (const cell of (rows[i] ?? [])) {
      if (!cell) continue
      const digits = String(cell).trim().replace(/\D/g, '')
      if (digits.length === 11) return digits
    }
  }
  return ''
}

function adjustDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

export type ExtractoRow = {
  fecha: string
  descripcion: string
  monto: number        // absolute value
  tipo: 'INGRESO' | 'EGRESO'
}

export type AppTxn = {
  id: string
  date: string
  amount: number
  type: 'INGRESO' | 'EGRESO'
  description: string
  category: string
}

export type ConciliadoItem = { extracto: ExtractoRow; app: AppTxn }

export type AccountOption = { id: string; bank_name: string; account_number: string | null }

export type ConciliacionResult =
  | { ok: false; error: string; needsAccount?: false }
  | { ok: false; needsAccount: true; acctNumRaw: string; accounts: AccountOption[] }
  | {
      ok: true
      accountId: string
      accountName: string
      saldoExtracto: number
      saldoApp: number
      periodo: { desde: string; hasta: string }
      conciliados: ConciliadoItem[]
      sinRegistrar: ExtractoRow[]
      sinConfirmar: AppTxn[]
    }

export async function conciliarExtractoAction(formData: FormData): Promise<ConciliacionResult> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'No se adjuntó archivo' }

  const overrideAccountId = (formData.get('account_id') as string | null) || null

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as (string | number | null)[][]

  for (let i = 0; i < Math.min(20, rows.length); i++) {
    console.log(`FILA ${i + 1}:`, JSON.stringify(rows[i]))
  }

  const year       = findYear(rows)
  const acctNumRaw = findAccountNumber(rows)

  // Saldo actual: row 11 (index 10), col D (index 3)
  const saldoExtracto = parseAmount((rows[10] ?? [])[3])

  // DESDE / HASTA from row 7 (index 6)
  const row7     = (rows[6] ?? []) as (string | number | null)[]
  const desdeStr = String(row7[0] ?? '').trim().replace(/\//g, '-')
  const hastaStr = String(row7[1] ?? '').trim().replace(/\//g, '-')
  const desde = /\d{4}-\d{2}-\d{2}/.test(desdeStr) ? desdeStr : `${year}-01-01`
  const hasta = /\d{4}-\d{2}-\d{2}/.test(hastaStr) ? hastaStr : `${year}-12-31`

  // Identify account
  let accountId: string | null = overrideAccountId
  let accountName = ''

  if (!accountId) {
    const tail = acctNumRaw.replace(/\D/g, '').slice(-8)
    if (tail) {
      const { data } = await supabase.from('bank_accounts').select('id, bank_name, account_number').ilike('account_number', `%${tail}`)
      if (data?.[0]) { accountId = data[0].id; accountName = data[0].bank_name }
    }
  }

  if (!accountId) {
    const { data: all } = await supabase.from('bank_accounts').select('id, bank_name, account_number').order('bank_name')
    if (all?.length === 1) { accountId = all[0].id; accountName = all[0].bank_name }
    else return { ok: false, needsAccount: true, acctNumRaw, accounts: all ?? [] }
  }

  if (!accountName) {
    const { data: acc } = await supabase.from('bank_accounts').select('bank_name').eq('id', accountId!).single()
    accountName = acc?.bank_name ?? ''
  }

  // Parse extracto movements (row 15 = index 14 onwards)
  const extractoRows: ExtractoRow[] = []
  for (let i = 14; i < rows.length; i++) {
    const row      = (rows[i] ?? []) as (string | number | null)[]
    const dateCell = row[0]
    const desc     = String(row[1] ?? '').trim()
    const raw      = parseAmount(row[4])

    if (!dateCell || !desc || raw === 0) continue

    let fullDate: string | null = null
    if (typeof dateCell === 'number') {
      const d = XLSX.SSF.parse_date_code(dateCell)
      if (d) fullDate = `${year}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } else {
      const parts = String(dateCell).trim().split('/')
      if (parts.length >= 2) {
        fullDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
    }
    if (!fullDate) continue

    extractoRows.push({ fecha: fullDate, descripcion: desc, monto: Math.abs(raw), tipo: raw >= 0 ? 'INGRESO' : 'EGRESO' })
  }

  if (extractoRows.length === 0) {
    return { ok: false, error: 'No se encontraron movimientos en el archivo. Verifica que sea el extracto correcto.' }
  }

  // Query existing app transactions for the period (±1 day margin)
  const { data: appTxnsRaw } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, type, description, category')
    .eq('account_id', accountId!)
    .gte('date', adjustDate(desde, -1))
    .lte('date', adjustDate(hasta, 1))

  const appTxns: AppTxn[] = (appTxnsRaw ?? []).map(t => ({
    id: t.id,
    date: t.date as string,
    amount: Number(t.amount),
    type: t.type as 'INGRESO' | 'EGRESO',
    description: t.description as string,
    category: t.category as string,
  }))

  // Greedy matching: for each extracto row, find best matching app transaction
  const matchedAppIds       = new Set<string>()
  const matchedExtractoIdxs = new Set<number>()
  const conciliados: ConciliadoItem[] = []

  for (let i = 0; i < extractoRows.length; i++) {
    const ex = extractoRows[i]
    let bestMatch: AppTxn | null = null
    let bestDays  = Infinity

    for (const app of appTxns) {
      if (matchedAppIds.has(app.id)) continue
      if (ex.tipo !== app.type) continue
      if (Math.abs(ex.monto - app.amount) > 1) continue

      const days = Math.abs(daysBetween(ex.fecha, app.date))
      if (days > 1) continue
      if (days < bestDays) { bestDays = days; bestMatch = app }
    }

    if (bestMatch) {
      matchedAppIds.add(bestMatch.id)
      matchedExtractoIdxs.add(i)
      conciliados.push({ extracto: ex, app: bestMatch })
    }
  }

  const sinRegistrar = extractoRows.filter((_, i) => !matchedExtractoIdxs.has(i))
  const sinConfirmar = appTxns.filter(t => !matchedAppIds.has(t.id))

  // Calculate saldoApp up to hasta date — paginado (mismo bug de saldo si la cuenta pasa de 1000 mov.)
  const [{ data: accData }, allTxns] = await Promise.all([
    supabase.from('bank_accounts').select('initial_balance').eq('id', accountId!).single(),
    fetchAll<{ type: string; amount: number }>((from, to) =>
      supabase.from('bank_transactions').select('type, amount').eq('account_id', accountId!).lte('date', hasta)
        .order('id', { ascending: true }).range(from, to)),
  ])

  const initial   = Number(accData?.initial_balance ?? 0)
  const ingresos  = allTxns.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egresos   = allTxns.filter(t => t.type === 'EGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const saldoApp  = initial + ingresos - egresos

  return {
    ok: true,
    accountId: accountId!,
    accountName,
    saldoExtracto,
    saldoApp,
    periodo: { desde, hasta },
    conciliados,
    sinRegistrar,
    sinConfirmar,
  }
}

/** Deletes all transactions that were auto-inserted by previous extracto imports */
export async function limpiarExtractoBancolombia(): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const { data, error } = await supabase
    .from('bank_transactions')
    .delete()
    .eq('source', 'EXTRACTO_BANCOLOMBIA')
    .select('id')
  if (error) return { ok: false, deleted: 0, error: error.message }
  revalidatePath('/bancos')
  return { ok: true, deleted: (data ?? []).length }
}
