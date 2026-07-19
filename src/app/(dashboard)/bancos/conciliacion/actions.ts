'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
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

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
  )
}

/** Primer y último día del mes (YYYY-MM-DD). */
function monthBounds(year: number, month: number): { desde: string; hasta: string } {
  const mm = String(month).padStart(2, '0')
  const last = new Date(year, month, 0).getDate() // día 0 del mes siguiente = último del actual
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(last).padStart(2, '0')}` }
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
      year: number
      month: number
      periodo: { desde: string; hasta: string }
      // Resumen del extracto
      saldoInicial: number
      totalIngresos: number
      totalEgresos: number
      saldoFinal: number      // saldo del extracto al cierre del mes
      // Saldo de la app al cierre del mes
      saldoApp: number
      conciliados: ConciliadoItem[]
      sinRegistrar: ExtractoRow[]
      sinConfirmar: AppTxn[]
    }

// ── cruce de conciliación por mes ──────────────────────────────────────────────

export async function conciliarAction(
  formData: FormData,
): Promise<ConciliacionResult> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'No se adjuntó archivo' }

  const year  = parseInt(formData.get('year') as string)  || new Date().getFullYear()
  const month = parseInt(formData.get('month') as string) || (new Date().getMonth() + 1)
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

  // ── Número de cuenta: fila 8 (idx 7), col D (idx 3) ───────────────────────
  const acctCell   = ((rows[7] ?? []) as (string | number | null)[])[3]
  const acctNumRaw = acctCell ? String(acctCell).trim().replace(/\D/g, '') : ''

  // ── Saldo final del extracto: fila 11 (idx 10), col D (idx 3) ──────────────
  const saldoFinal = parseAmt(((rows[10] ?? []) as (string | number | null)[])[3])

  // ── Movimientos: fila 16 (idx 15) en adelante ─────────────────────────────
  const { desde, hasta } = monthBounds(year, month)
  const extractoRows: ExtractoRow[] = []
  for (let i = 15; i < rows.length; i++) {
    const row      = (rows[i] ?? []) as (string | number | null)[]
    const dateCell = row[0]
    const desc     = String(row[1] ?? '').trim()
    const rawAmt   = parseAmt(row[4])   // col E = neto (+ ingreso, - egreso)

    if (!dateCell || !desc || rawAmt === 0) continue
    const fullDate = isoDate(dateCell as string | number, year)
    if (!fullDate) continue
    // Solo movimientos dentro del mes seleccionado
    if (fullDate < desde || fullDate > hasta) continue

    extractoRows.push({
      fecha:       fullDate,
      descripcion: desc,
      monto:       Math.abs(rawAmt),
      tipo:        rawAmt >= 0 ? 'INGRESO' : 'EGRESO',
    })
  }

  if (extractoRows.length === 0) {
    return {
      ok: false,
      error: `No se encontraron movimientos del mes seleccionado en el extracto. Verifica que el archivo corresponda a ${desde} → ${hasta}.`,
    }
  }

  // ── Identificar la cuenta ─────────────────────────────────────────────────
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
      .from('bank_accounts').select('bank_name').eq('id', accountId!).single()
    accountName = acc?.bank_name ?? ''
  }

  // ── Transacciones de la app SOLO del mes (primer–último día) ───────────────
  const { data: appRaw } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, type, description, category')
    .eq('account_id', accountId!)
    .gte('date', desde)
    .lte('date', hasta)

  type AppTxnExt = AppTxn & { category: string | null }
  const appTxns: AppTxnExt[] = (appRaw ?? []).map(t => ({
    id:          t.id as string,
    date:        t.date as string,
    amount:      Number(t.amount),
    type:        t.type as 'INGRESO' | 'EGRESO',
    description: (t.description as string) ?? '',
    category:    (t.category as string | null) ?? null,
  }))

  // ── Clasificación Flypass ──────────────────────────────────────────────────
  const PEAJE_PUC = '61450575'
  const isFlyDesc = (s: string) => /flypass/i.test(s)
  const isFlyApp  = (t: AppTxnExt) => isFlyDesc(t.description) || t.category === PEAJE_PUC

  const matchedAppIds       = new Set<string>()
  const matchedExtractoIdxs = new Set<number>()
  const conciliados: ConciliadoItem[] = []

  // ── 1. Flypass agrupado por día: suma extracto vs suma app (±100) ──────────
  const flyExByDay = new Map<string, number[]>()          // día → índices de extracto
  extractoRows.forEach((r, i) => {
    if (!isFlyDesc(r.descripcion)) return
    const arr = flyExByDay.get(r.fecha) ?? []
    arr.push(i); flyExByDay.set(r.fecha, arr)
  })
  const flyAppByDay = new Map<string, AppTxnExt[]>()       // día → transacciones app
  for (const t of appTxns) {
    if (!isFlyApp(t)) continue
    const arr = flyAppByDay.get(t.date) ?? []
    arr.push(t); flyAppByDay.set(t.date, arr)
  }
  for (const [day, exIdxs] of flyExByDay) {
    const appList = flyAppByDay.get(day) ?? []
    if (appList.length === 0) continue
    const sumEx  = exIdxs.reduce((s, i) => s + extractoRows[i].monto, 0)
    const sumApp = appList.reduce((s, t) => s + t.amount, 0)
    if (Math.abs(sumEx - sumApp) <= 100) {
      exIdxs.forEach(i => matchedExtractoIdxs.add(i))
      appList.forEach(t => matchedAppIds.add(t.id))
      conciliados.push({
        extracto: { fecha: day, descripcion: `Flypass — ${exIdxs.length} mov. extracto`, monto: sumEx, tipo: 'EGRESO' },
        app:      { id: `flypass_${day}`, date: day, amount: sumApp, type: 'EGRESO', description: `Pago Flypass — ${appList.length} mov. app` },
      })
    }
  }

  // ── 2. Resto: match individual (mismo tipo, monto ±10, fecha ±1 día) ────────
  for (let i = 0; i < extractoRows.length; i++) {
    if (matchedExtractoIdxs.has(i)) continue
    const ex = extractoRows[i]
    if (isFlyDesc(ex.descripcion)) continue   // Flypass solo se concilia por día (paso 1)
    let best: AppTxnExt | null = null
    let bestDays = Infinity

    for (const app of appTxns) {
      if (matchedAppIds.has(app.id))            continue
      if (isFlyApp(app))                        continue   // no mezclar Flypass en match individual
      if (ex.tipo !== app.type)                 continue
      if (Math.abs(ex.monto - app.amount) > 10) continue   // ±10 pesos (redondeos del banco)
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
  const sinConfirmar: AppTxn[] = appTxns
    .filter(t => !matchedAppIds.has(t.id))
    .map(t => ({ id: t.id, date: t.date, amount: t.amount, type: t.type, description: t.description }))

  // ── Resumen del extracto ──────────────────────────────────────────────────
  const totalIngresos = extractoRows.filter(r => r.tipo === 'INGRESO').reduce((s, r) => s + r.monto, 0)
  const totalEgresos  = extractoRows.filter(r => r.tipo === 'EGRESO').reduce((s, r) => s + r.monto, 0)
  const saldoInicial  = saldoFinal - totalIngresos + totalEgresos

  // ── Saldo de la app al cierre del mes ─────────────────────────────────────
  const saldoApp = await computeSaldoApp(accountId!, hasta)

  return {
    ok: true,
    accountId: accountId!,
    accountName,
    year, month,
    periodo: { desde, hasta },
    saldoInicial,
    totalIngresos,
    totalEgresos,
    saldoFinal,
    saldoApp,
    conciliados,
    sinRegistrar,
    sinConfirmar,
  }
}

/** Saldo de la app = saldo inicial de la cuenta + ingresos − egresos hasta la fecha. */
async function computeSaldoApp(accountId: string, hasta: string): Promise<number> {
  const [{ data: accData }, { data: allTxns }] = await Promise.all([
    supabase.from('bank_accounts').select('initial_balance').eq('id', accountId).single(),
    supabase.from('bank_transactions').select('type, amount').eq('account_id', accountId).lte('date', hasta),
  ])
  const initial = Number(accData?.initial_balance ?? 0)
  const ing = (allTxns ?? []).filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egr = (allTxns ?? []).filter(t => t.type === 'EGRESO' ).reduce((s, t) => s + Number(t.amount), 0)
  return initial + ing - egr
}

// ── Cerrar mes ─────────────────────────────────────────────────────────────────

export type CerrarMesInput = {
  accountId: string
  year: number
  month: number
  saldoInicial: number
  totalIngresos: number
  totalEgresos: number
  saldoFinal: number
  conciliadas: number
  sinRegistrar: number
  sinConfirmar: number
}

/**
 * Cierra el mes: recalcula el saldo de la app y la diferencia con datos frescos,
 * y guarda el resumen en `bank_reconciliations` con status='CONCILIADO'.
 * No se puede reabrir un mes ya cerrado.
 */
export async function cerrarMesAction(
  input: CerrarMesInput,
): Promise<{ ok: boolean; error?: string }> {
  const { accountId, year, month } = input
  if (!accountId || !year || !month) return { ok: false, error: 'Datos incompletos.' }

  // No permitir re-cerrar un mes ya conciliado
  const { data: existing } = await supabase
    .from('bank_reconciliations')
    .select('id, status')
    .eq('account_id', accountId).eq('year', year).eq('month', month)
    .maybeSingle()
  if (existing?.status === 'CONCILIADO') {
    return { ok: false, error: 'Este mes ya está conciliado y no puede reabrirse.' }
  }

  const { hasta } = monthBounds(year, month)
  const appSaldoFinal = await computeSaldoApp(accountId, hasta)
  const diferencia    = Math.round((input.saldoFinal - appSaldoFinal) * 100) / 100

  const row = {
    account_id:                  accountId,
    year, month,
    status:                      'CONCILIADO',
    extracto_saldo_inicial:      Math.round(input.saldoInicial),
    extracto_total_ingresos:     Math.round(input.totalIngresos),
    extracto_total_egresos:      Math.round(input.totalEgresos),
    extracto_saldo_final:        Math.round(input.saldoFinal),
    app_saldo_final:             Math.round(appSaldoFinal),
    diferencia:                  Math.round(diferencia),
    transacciones_conciliadas:   input.conciliadas,
    transacciones_sin_registrar: input.sinRegistrar,
    transacciones_sin_confirmar: input.sinConfirmar,
    closed_at:                   new Date().toISOString(),
  }

  const { error } = await supabase
    .from('bank_reconciliations')
    .upsert(row, { onConflict: 'account_id,year,month' })
  if (error) {
    console.error('[cerrarMes] error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath('/bancos/conciliacion')
  return { ok: true }
}
