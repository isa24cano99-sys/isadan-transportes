'use server'

import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
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
  nota?: string   // aviso (p. ej. posible diferencia de fecha) para la sección "sin confirmar"
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

  const result = await cruzarExtracto(accountId!, accountName, year, month, extractoRows, saldoFinal)
  await guardarPendiente(result, extractoRows)
  return result
}

type OkResult = Extract<ConciliacionResult, { ok: true }>

/** Cruza los movimientos del extracto contra las transacciones app del mismo mes. */
async function cruzarExtracto(
  accountId: string, accountName: string, year: number, month: number,
  extractoRows: ExtractoRow[], saldoFinal: number,
): Promise<OkResult> {
  const { desde, hasta } = monthBounds(year, month)

  // ── Transacciones de la app SOLO del mes (primer–último día) ───────────────
  const { data: appRaw } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, type, description, category')
    .eq('account_id', accountId)
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

  // ── Clasificadores de grupos especiales (se concilian por grupo, no individual) ──
  const PEAJE_PUC   = '61450575'
  const GMF_PUC     = '53050505'
  const INTERES_PUC = '42100510'
  const isFlyDesc     = (s: string) => /flypass/i.test(s)
  const isInteresDesc = (s: string) => /interes/i.test(s)                                // 'ABONO INTERESES AHORROS', 'INTERESES'
  const isGmfDesc     = (s: string) => /4\s?x\s?1000|impto\.?\s*gobierno|gmf/i.test(s)    // 'IMPTO GOBIERNO 4X1000', 'GMF'
  const isFlyApp      = (t: AppTxnExt) => isFlyDesc(t.description) || t.category === PEAJE_PUC
  const isInteresApp  = (t: AppTxnExt) => isInteresDesc(t.description) || t.category === INTERES_PUC
  const isGmfApp      = (t: AppTxnExt) => isGmfDesc(t.description) || t.category === GMF_PUC
  // Flypass e intereses solo se concilian por grupo; GMF puede además emparejar individual (±50)
  const isGroupOnlyEx  = (r: ExtractoRow) => isFlyDesc(r.descripcion) || isInteresDesc(r.descripcion)
  const isGroupOnlyApp = (t: AppTxnExt) => isFlyApp(t) || isInteresApp(t)

  const matchedAppIds       = new Set<string>()
  const matchedExtractoIdxs = new Set<number>()
  const conciliados: ConciliadoItem[] = []

  // Agrupación mensual: suma de movimientos del extracto vs suma en app (±tolerancia)
  const matchGrupoMensual = (
    nombre: string,
    exPred: (r: ExtractoRow) => boolean,
    appPred: (t: AppTxnExt) => boolean,
    tolerancia: number,
    tipo: 'INGRESO' | 'EGRESO',
  ) => {
    const exIdxs  = extractoRows.map((_, i) => i).filter(i => !matchedExtractoIdxs.has(i) && exPred(extractoRows[i]))
    const appList = appTxns.filter(t => !matchedAppIds.has(t.id) && appPred(t))
    if (exIdxs.length === 0 || appList.length === 0) return
    const sumEx  = exIdxs.reduce((s, i) => s + extractoRows[i].monto, 0)
    const sumApp = appList.reduce((s, t) => s + t.amount, 0)
    if (Math.abs(sumEx - sumApp) > tolerancia) return
    exIdxs.forEach(i => matchedExtractoIdxs.add(i))
    appList.forEach(t => matchedAppIds.add(t.id))
    const day = extractoRows[exIdxs[0]].fecha
    conciliados.push({
      extracto: { fecha: day, descripcion: `${nombre} — ${exIdxs.length} mov. extracto`, monto: sumEx, tipo },
      app:      { id: `grupo_${nombre}_${day}`, date: day, amount: sumApp, type: tipo, description: `${nombre} — ${appList.length} mov. app` },
    })
  }

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

  // ── 2. Intereses bancarios (mes) y GMF 4x1000 (mes): suma vs suma (±500) ────
  matchGrupoMensual('Intereses bancarios', r => isInteresDesc(r.descripcion), isInteresApp, 500, 'INGRESO')
  matchGrupoMensual('GMF 4x1000',          r => isGmfDesc(r.descripcion),     isGmfApp,     500, 'EGRESO')

  // ── 3. Resto: match individual (mismo tipo, monto ±10, fecha ±1 día) ────────
  for (let i = 0; i < extractoRows.length; i++) {
    if (matchedExtractoIdxs.has(i)) continue
    const ex = extractoRows[i]
    if (isGroupOnlyEx(ex)) continue   // Flypass/intereses solo se concilian por grupo
    const exIsGmf = isGmfDesc(ex.descripcion)
    let best: AppTxnExt | null = null
    let bestDays = Infinity

    for (const app of appTxns) {
      if (matchedAppIds.has(app.id))             continue
      if (isGroupOnlyApp(app))                   continue   // no mezclar Flypass/intereses en individual
      if (ex.tipo !== app.type)                  continue
      if (exIsGmf !== isGmfApp(app))             continue   // GMF solo empareja con GMF
      const tol = exIsGmf ? 50 : 10              // GMF ±50 (decimales del banco, ej. $4.452,38); resto ±10
      if (Math.abs(ex.monto - app.amount) > tol) continue
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
    .map(t => {
      // Si el extracto trae un movimiento del mismo tipo y monto similar (±500) pero
      // con fecha a más de 3 días, puede ser un desfase de mes (llegó en otro mes).
      const desfase = sinRegistrar.some(r =>
        r.tipo === t.type &&
        Math.abs(r.monto - t.amount) <= 500 &&
        Math.abs(daysBetween(r.fecha, t.date)) > 3)
      const base = { id: t.id, date: t.date, amount: t.amount, type: t.type, description: t.description }
      return desfase ? { ...base, nota: 'Posible diferencia de fecha — verificar manualmente' } : base
    })

  const totalIngresos = extractoRows.filter(r => r.tipo === 'INGRESO').reduce((s, r) => s + r.monto, 0)
  const totalEgresos  = extractoRows.filter(r => r.tipo === 'EGRESO').reduce((s, r) => s + r.monto, 0)
  const saldoInicial  = saldoFinal - totalIngresos + totalEgresos
  const saldoApp      = await computeSaldoApp(accountId, hasta)

  return {
    ok: true,
    accountId, accountName, year, month,
    periodo: { desde, hasta },
    saldoInicial, totalIngresos, totalEgresos, saldoFinal, saldoApp,
    conciliados, sinRegistrar, sinConfirmar,
  }
}

/** Guarda/actualiza el cruce como PENDIENTE (no toca meses ya CONCILIADOS). */
async function guardarPendiente(result: OkResult, extractoRows: ExtractoRow[]): Promise<void> {
  const { data: existing } = await supabase
    .from('bank_reconciliations').select('status')
    .eq('account_id', result.accountId).eq('year', result.year).eq('month', result.month)
    .maybeSingle()
  if (existing?.status === 'CONCILIADO') return

  const row = {
    account_id:                  result.accountId,
    year:                        result.year,
    month:                       result.month,
    status:                      'PENDIENTE',
    extracto_saldo_inicial:      Math.round(result.saldoInicial),
    extracto_total_ingresos:     Math.round(result.totalIngresos),
    extracto_total_egresos:      Math.round(result.totalEgresos),
    extracto_saldo_final:        Math.round(result.saldoFinal),
    app_saldo_final:             Math.round(result.saldoApp),
    diferencia:                  Math.round(result.saldoFinal - result.saldoApp),
    transacciones_conciliadas:   result.conciliados.length,
    transacciones_sin_registrar: result.sinRegistrar.length,
    transacciones_sin_confirmar: result.sinConfirmar.length,
    extracto_data:               extractoRows,
    resultado_data: {
      accountName:   result.accountName,
      periodo:       result.periodo,
      saldoInicial:  result.saldoInicial,
      totalIngresos: result.totalIngresos,
      totalEgresos:  result.totalEgresos,
      saldoFinal:    result.saldoFinal,
      saldoApp:      result.saldoApp,
      conciliados:   result.conciliados,
      sinRegistrar:  result.sinRegistrar,
      sinConfirmar:  result.sinConfirmar,
    },
  }
  const { error } = await supabase
    .from('bank_reconciliations').upsert(row, { onConflict: 'account_id,year,month' })
  if (error) console.error('[guardarPendiente] error:', error.message)
  revalidatePath('/bancos/conciliacion')
}

/**
 * Re-cruza usando el extracto ya guardado (sin re-subir archivo). Se usa al refrescar
 * tras registrar un movimiento cuando la sesión cargó datos persistidos.
 */
export async function recruzarAction(
  accountId: string, year: number, month: number,
): Promise<ConciliacionResult> {
  const { data: rec } = await supabase
    .from('bank_reconciliations')
    .select('extracto_data, extracto_saldo_final, resultado_data, status')
    .eq('account_id', accountId).eq('year', year).eq('month', month)
    .maybeSingle()
  if (!rec?.extracto_data) return { ok: false, error: 'No hay extracto guardado para este mes. Sube el extracto.' }
  if (rec.status === 'CONCILIADO') return { ok: false, error: 'Este mes ya está conciliado.' }

  const { data: acc } = await supabase.from('bank_accounts').select('bank_name').eq('id', accountId).single()
  const extractoRows = rec.extracto_data as ExtractoRow[]
  const saldoFinal   = Number((rec.resultado_data as any)?.saldoFinal ?? rec.extracto_saldo_final ?? 0)
  const result = await cruzarExtracto(accountId, acc?.bank_name ?? '', year, month, extractoRows, saldoFinal)
  await guardarPendiente(result, extractoRows)
  return result
}

/** Saldo de la app = saldo inicial de la cuenta + ingresos − egresos hasta la fecha. */
async function computeSaldoApp(accountId: string, hasta: string): Promise<number> {
  const [{ data: accData }, allTxns] = await Promise.all([
    supabase.from('bank_accounts').select('initial_balance').eq('id', accountId).single(),
    // Paginado: mismo bug de saldo del módulo Bancos si la cuenta pasa de 1000 movimientos.
    fetchAll<{ type: string; amount: number }>((from, to) =>
      supabase.from('bank_transactions').select('type, amount').eq('account_id', accountId).lte('date', hasta)
        .order('id', { ascending: true }).range(from, to)),
  ])
  const initial = Number(accData?.initial_balance ?? 0)
  const ing = allTxns.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0)
  const egr = allTxns.filter(t => t.type === 'EGRESO' ).reduce((s, t) => s + Number(t.amount), 0)
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
