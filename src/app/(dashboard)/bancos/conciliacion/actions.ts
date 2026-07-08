'use server'

import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function parseAmt(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const s = String(raw).replace(/,/g, '').trim()
  return parseFloat(s) || 0
}

function isoDate(dateCell: string | number, year: number): string | null {
  if (typeof dateCell === 'number') {
    const d = XLSX.SSF.parse_date_code(dateCell)
    if (!d) return null
    return `${d.y ?? year}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const parts = String(dateCell).trim().split('/')
  if (parts.length >= 2) {
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    const y = parts[2] ? parts[2].trim().padStart(4, '20') : String(year)
    return `${y}-${m}-${d}`
  }
  const iso = String(dateCell).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return null
}

function inferYear(rows: (string | number | null)[][]): number {
  for (const row of rows.slice(0, 15)) {
    for (const cell of row ?? []) {
      const m = String(cell ?? '').match(/(\d{4})[\/\-]\d{1,2}[\/\-]\d{1,2}/)
      if (m) {
        const y = parseInt(m[1])
        if (y >= 2020 && y <= 2035) return y
      }
    }
  }
  return new Date().getFullYear()
}

function adjustDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
  )
}

// ── exported types ────────────────────────────────────────────────────────────

export type ExtractoRow = {
  fecha: string
  descripcion: string
  monto: number       // always positive
  tipo: 'INGRESO' | 'EGRESO'
}

export type AppTxn = {
  id: string
  date: string
  amount: number
  type: 'INGRESO' | 'EGRESO'
  description: string
}

export type ConciliadoItem = { extracto: ExtractoRow; app: AppTxn }

export type AccountOption = { id: string; bank_name: string; account_number: string | null }

export type ConciliacionResult =
  | { ok: false; error: string }
  | { ok: false; needsAccount: true; acctNumRaw: string; accounts: AccountOption[] }
  | {
      ok: true
      accountId: string
      accountName: string
      periodo: { desde: string; hasta: string }
      saldoExtracto: number
      saldoApp: number
      conciliados: ConciliadoItem[]
      sinRegistrar: ExtractoRow[]
      sinConfirmar: AppTxn[]
    }

// ── main action ───────────────────────────────────────────────────────────────

export async function conciliarAction(
  formData: FormData,
): Promise<ConciliacionResult> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'No se adjuntó archivo' }

  const overrideAccountId = (formData.get('account_id') as string | null) || null

  const buffer = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    return { ok: false, error: 'El archivo no es un Excel válido (.xlsx/.xls)' }
  }
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as (string | number | null)[][]

  const year = inferYear(rows)

  // ── Account number: row 8 (index 7), col D (index 3) ──────────────────────
  const acctCell  = ((rows[7] ?? []) as (string | number | null)[])[3]
  const acctNumRaw = acctCell ? String(acctCell).trim().replace(/\D/g, '') : ''

  // ── Saldo extracto: row 11 (index 10), col D (index 3) ────────────────────
  const saldoExtracto = parseAmt(((rows[10] ?? []) as (string | number | null)[])[3])

  // ── Period: try several candidate rows ────────────────────────────────────
  let desde = `${year}-01-01`
  let hasta  = `${year}-12-31`
  for (let i = 4; i <= 9; i++) {
    const row = (rows[i] ?? []) as (string | number | null)[]
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell) continue
      const s = String(cell).trim()
      if (s.includes('/') || /\d{4}-\d{2}-\d{2}/.test(s)) {
        const d0 = isoDate(cell as string | number, year)
        const d1 = row[c + 1] ? isoDate(row[c + 1] as string | number, year) : null
        if (d0 && d1 && d1 > d0) { desde = d0; hasta = d1; break }
        if (d0 && !hasta.includes(String(year).slice(0, 3))) { desde = d0 }
      }
    }
  }

  // ── Movements: row 16 (index 15) onwards ──────────────────────────────────
  const extractoRows: ExtractoRow[] = []
  for (let i = 15; i < rows.length; i++) {
    const row      = (rows[i] ?? []) as (string | number | null)[]
    const dateCell = row[0]
    const desc     = String(row[1] ?? '').trim()
    const rawAmt   = parseAmt(row[4])   // col E = net amount (+ ingreso, - egreso)

    if (!dateCell || !desc || rawAmt === 0) continue
    const fullDate = isoDate(dateCell as string | number, year)
    if (!fullDate) continue

    extractoRows.push({
      fecha:     fullDate,
      descripcion: desc,
      monto:     Math.abs(rawAmt),
      tipo:      rawAmt >= 0 ? 'INGRESO' : 'EGRESO',
    })
  }

  if (extractoRows.length === 0) {
    return {
      ok: false,
      error: 'No se encontraron movimientos. Verifica que el archivo sea el extracto de Bancolombia correcto.',
    }
  }

  // ── Identify bank account ─────────────────────────────────────────────────
  let accountId: string | null = overrideAccountId
  let accountName = ''

  if (!accountId && acctNumRaw.length >= 8) {
    const tail = acctNumRaw.slice(-8)
    const { data } = await supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number')
      .ilike('account_number', `%${tail}`)
    if (data?.[0]) { accountId = data[0].id; accountName = data[0].bank_name }
  }

  if (!accountId) {
    const { data: all } = await supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number')
      .order('bank_name')
    if (all?.length === 1) { accountId = all[0].id; accountName = all[0].bank_name }
    else return { ok: false, needsAccount: true, acctNumRaw, accounts: all ?? [] }
  }

  if (!accountName) {
    const { data: acc } = await supabase
      .from('bank_accounts')
      .select('bank_name')
      .eq('id', accountId!)
      .single()
    accountName = acc?.bank_name ?? ''
  }

  // ── Fetch app transactions for the period ─────────────────────────────────
  const { data: appRaw } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, type, description')
    .eq('account_id', accountId!)
    .gte('date', adjustDate(desde, -1))
    .lte('date', adjustDate(hasta,  1))

  const appTxns: AppTxn[] = (appRaw ?? []).map(t => ({
    id:          t.id as string,
    date:        t.date as string,
    amount:      Number(t.amount),
    type:        t.type as 'INGRESO' | 'EGRESO',
    description: t.description as string,
  }))

  // ── Greedy matching: extracto ↔ app ───────────────────────────────────────
  const matchedAppIds       = new Set<string>()
  const matchedExtractoIdxs = new Set<number>()
  const conciliados: ConciliadoItem[] = []

  for (let i = 0; i < extractoRows.length; i++) {
    const ex = extractoRows[i]
    let best: AppTxn | null = null
    let bestDays = Infinity

    for (const app of appTxns) {
      if (matchedAppIds.has(app.id))       continue
      if (ex.tipo !== app.type)             continue
      if (Math.abs(ex.monto - app.amount) > 1) continue
      const days = Math.abs(daysBetween(ex.fecha, app.date))
      if (days > 1) continue
      if (days < bestDays) { bestDays = days; best = app }
    }

    if (best) {
      matchedAppIds.add(best.id)
      matchedExtractoIdxs.add(i)
      conciliados.push({ extracto: ex, app: best })
    }
  }

  const sinRegistrar = extractoRows.filter((_, i) => !matchedExtractoIdxs.has(i))
  const sinConfirmar = appTxns.filter(t => !matchedAppIds.has(t.id))

  // ── Saldo app at period end ───────────────────────────────────────────────
  const [{ data: accData }, { data: allTxns }] = await Promise.all([
    supabase.from('bank_accounts').select('initial_balance').eq('id', accountId!).single(),
    supabase
      .from('bank_transactions')
      .select('type, amount')
      .eq('account_id', accountId!)
      .lte('date', hasta),
  ])
  const initial  = Number(accData?.initial_balance ?? 0)
  const ing      = (allTxns ?? []).filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egr      = (allTxns ?? []).filter(t => t.type === 'EGRESO' ).reduce((s, t) => s + Number(t.amount), 0)
  const saldoApp = initial + ing - egr

  return {
    ok: true,
    accountId: accountId!,
    accountName,
    periodo: { desde, hasta },
    saldoExtracto,
    saldoApp,
    conciliados,
    sinRegistrar,
    sinConfirmar,
  }
}
