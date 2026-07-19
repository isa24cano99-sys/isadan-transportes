'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronRight, X, GitMerge, Lock, Plus, Calendar, RefreshCw,
} from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import CategorySelector from '@/components/CategorySelector'
import type { PucAccount } from '@/components/PucSelector'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'
import {
  conciliarAction, cerrarMesAction, recruzarAction,
  type ConciliacionResult, type ExtractoRow, type AccountOption,
  type ConciliadoItem, type AppTxn,
} from './actions'
import { crearTransaccionAction } from '../transaccion/actions'

// ── Tipos compartidos con la página ─────────────────────────────────────────

export type AccountLite = { id: string; bank_name: string; account_number: string | null }

export type SavedResultado = {
  accountName: string
  periodo: { desde: string; hasta: string }
  saldoInicial: number
  totalIngresos: number
  totalEgresos: number
  saldoFinal: number
  saldoApp: number
  conciliados: ConciliadoItem[]
  sinRegistrar: ExtractoRow[]
  sinConfirmar: AppTxn[]
}

export type ReconciliacionRow = {
  id: string
  accountId: string
  year: number
  month: number
  status: 'PENDIENTE' | 'CONCILIADO'
  saldoInicial: number
  totalIngresos: number
  totalEgresos: number
  saldoFinal: number
  appSaldoFinal: number
  diferencia: number
  conciliadas: number
  sinRegistrar: number
  sinConfirmar: number
  closedAt: string | null
  resultadoData: SavedResultado | null
  hasExtracto: boolean
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const mesLabel = (m: number) => MESES[m - 1] ?? String(m)

function monthsInRange(minDate: string | null, maxDate: string | null): { year: number; month: number }[] {
  const now = new Date()
  const start = minDate ? new Date(minDate + 'T00:00:00') : now
  const end   = maxDate ? new Date(maxDate + 'T00:00:00') : now
  const list: { year: number; month: number }[] = []
  let y = start.getFullYear(), m = start.getMonth() + 1
  const endY = end.getFullYear(), endM = end.getMonth() + 1
  let guard = 0
  while ((y < endY || (y === endY && m <= endM)) && guard++ < 240) {
    list.push({ year: y, month: m })
    m++; if (m > 12) { m = 1; y++ }
  }
  if (list.length === 0) list.push({ year: now.getFullYear(), month: now.getMonth() + 1 })
  return list.reverse()
}

// ── RegistrarModal ────────────────────────────────────────────────────────────

function RegistrarModal({
  row, accountId, categories, pucAccounts, onClose, onDone,
}: {
  row: ExtractoRow
  accountId: string
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  onClose: () => void
  onDone: () => void
}) {
  const [desc,       setDesc]       = useState(row.descripcion)
  const [categoryId, setCategoryId] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const handleSave = async () => {
    if (!categoryId) { setError('Selecciona una categoría'); return }
    setSaving(true)
    const fd = new FormData()
    fd.set('account_id',  accountId)
    fd.set('type',        row.tipo)
    fd.set('amount',      String(row.monto))
    fd.set('date',        row.fecha)
    fd.set('category_id', categoryId)
    fd.set('description', desc)
    const res = await crearTransaccionAction(fd)
    if (res.ok) onDone()
    else { setError(res.error ?? 'Error al guardar'); setSaving(false) }
  }

  const cls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#0F172A]">Registrar movimiento</h2>
          <button onClick={onClose}><X size={18} className="text-[#64748B]" /></button>
        </div>
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-[#94A3B8] mb-0.5">Fecha</p><p className="font-mono text-[#0F172A]">{formatDate(row.fecha)}</p></div>
          <div><p className="text-[#94A3B8] mb-0.5">Tipo</p><p className={`font-semibold ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{row.tipo}</p></div>
          <div><p className="text-[#94A3B8] mb-0.5">Monto</p><p className={`font-bold tabular-nums ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}</p></div>
          <div className="col-span-3"><p className="text-[#94A3B8] mb-0.5">Descripción banco</p><p className="text-[#64748B] truncate">{row.descripcion}</p></div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Descripción en la app</label>
            <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} className={`${cls} resize-none`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría *</label>
            <CategorySelector value={categoryId} onChange={setCategoryId} categories={categories} pucAccounts={pucAccounts} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-xs hover:bg-[#F8FAFC] transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-xs transition-colors">{saving ? 'Guardando…' : 'Registrar transacción'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Resumen de saldos (reusable) ──────────────────────────────────────────────

function SaldoResumen({ saldoFinal, saldoApp }: { saldoFinal: number; saldoApp: number }) {
  const diff = saldoFinal - saldoApp
  const absDiff = Math.abs(diff)
  const diffColor = absDiff === 0 ? 'text-green-600' : absDiff <= 10000 ? 'text-yellow-600' : 'text-red-600'
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-3">Comparación de saldos</p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Saldo extracto', value: saldoFinal, cls: 'text-[#0F172A]', diff: false },
          { label: 'Saldo app',      value: saldoApp,   cls: 'text-[#0F172A]', diff: false },
          { label: 'Diferencia',     value: diff,       cls: diffColor,        diff: true },
        ].map(({ label, value, cls, diff: isDiff }) => (
          <div key={label}>
            <p className="text-[10px] text-[#94A3B8] mb-0.5">{label}</p>
            <p className={`text-base md:text-lg font-bold tabular-nums ${cls}`}>
              {isDiff && absDiff === 0 ? '—' : `${isDiff && diff > 0 ? '+' : ''}${formatCOP(Math.abs(value))}`}
            </p>
          </div>
        ))}
      </div>
      <p className={`text-xs font-medium mt-3 ${diffColor}`}>
        {absDiff === 0 ? '✅ Saldo cuadrado perfectamente' : absDiff <= 10000 ? '⚠️ Diferencia menor — posible redondeo' : '🔴 Diferencia significativa — revisar transacciones'}
      </p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConciliacionClient({
  categories, pucAccounts, accounts, reconciliations, minDate, maxDate,
}: {
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  accounts: AccountLite[]
  reconciliations: ReconciliacionRow[]
  minDate: string | null
  maxDate: string | null
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<'list' | 'nueva'>('list')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')

  // Acordeón
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Flujo
  const now = new Date()
  const [flowYear,  setFlowYear]  = useState(now.getFullYear())
  const [flowMonth, setFlowMonth] = useState(now.getMonth() + 1)
  const [dragging,  setDragging]  = useState(false)
  const [file,      setFile]      = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result,    setResult]    = useState<ConciliacionResult | null>(null)
  const [needsAccounts, setNeedsAccounts] = useState<AccountOption[] | null>(null)
  const [acctRaw,   setAcctRaw]   = useState('')
  const [showConciliados, setShowConciliados] = useState(false)
  const [registrarRow, setRegistrarRow] = useState<ExtractoRow | null>(null)
  const [acepta,    setAcepta]    = useState(false)
  const [closing,   setClosing]   = useState(false)

  const res = result?.ok ? result : null

  const reconMap = useMemo(() => {
    const m = new Map<string, ReconciliacionRow>()
    for (const r of reconciliations) m.set(`${r.accountId}_${r.year}_${r.month}`, r)
    return m
  }, [reconciliations])

  const months = useMemo(() => monthsInRange(minDate, maxDate), [minDate, maxDate])
  const years  = useMemo(() => {
    const s = new Set<number>(months.map(x => x.year))
    s.add(now.getFullYear())
    return Array.from(s).sort((a, b) => b - a)
  }, [months, now])

  const reconFor = (y: number, m: number) => reconMap.get(`${accountId}_${y}_${m}`)

  // ── Flujo helpers ──────────────────────────────────────────────────────────

  const startNueva = (y?: number, m?: number) => {
    setFlowYear(y ?? now.getFullYear())
    setFlowMonth(m ?? (now.getMonth() + 1))
    setFile(null); setResult(null); setNeedsAccounts(null); setAcctRaw('')
    setAcepta(false); setShowConciliados(false)
    setMode('nueva')
  }

  // Abre el flujo con el resultado ya guardado (sin re-subir el extracto).
  const loadSaved = (rec: ReconciliacionRow) => {
    if (!rec.resultadoData) { startNueva(rec.year, rec.month); return }
    setFlowYear(rec.year); setFlowMonth(rec.month)
    setFile(null); setNeedsAccounts(null); setAcctRaw(''); setAcepta(false); setShowConciliados(false)
    setResult({ ok: true, accountId: rec.accountId, year: rec.year, month: rec.month, ...rec.resultadoData })
    setMode('nueva')
  }

  // "Recargar extracto": limpia el resultado para volver a subir el archivo del mismo mes.
  const recargarExtracto = () => { setResult(null); setFile(null); setNeedsAccounts(null); setAcepta(false) }

  // Tras registrar un movimiento, re-cruza: con archivo en memoria o desde lo guardado.
  const refreshCross = async () => {
    if (!res) return
    if (file) { await run(res.accountId); return }
    setProcessing(true)
    const r = await recruzarAction(res.accountId, res.year, res.month)
    setProcessing(false)
    if (r.ok) setResult(r)
  }

  // "Recalcular": re-cruza el extracto GUARDADO en Supabase contra las transacciones
  // actuales (sin re-subir archivo) y actualiza resultado_data.
  const recalcular = async () => {
    if (!res) return
    setProcessing(true)
    const r = await recruzarAction(res.accountId, res.year, res.month)
    setProcessing(false)
    if (r.ok) { setResult(r); return }
    if (file) { run(res.accountId); return }   // respaldo: si hay archivo en memoria
    alert(('error' in r ? r.error : undefined) ?? 'No se pudo recalcular. Sube el extracto del mes.')
  }

  const backToList = () => { setMode('list'); setResult(null); setFile(null) }

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Solo se aceptan archivos Excel (.xlsx o .xls)'); return }
    setFile(f); setResult(null); setNeedsAccounts(null); setAcctRaw('')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const run = async (overrideId?: string) => {
    if (!file) return
    setProcessing(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('year',  String(flowYear))
    fd.append('month', String(flowMonth))
    const acc = overrideId || accountId
    if (acc) fd.append('account_id', acc)
    const r = await conciliarAction(fd)
    if (!r.ok && (r as any).needsAccount) {
      setNeedsAccounts((r as any).accounts); setAcctRaw((r as any).acctNumRaw)
      setProcessing(false); return
    }
    setResult(r); setNeedsAccounts(null); setProcessing(false)
  }

  const handleCerrar = async () => {
    if (!res) return
    setClosing(true)
    const r = await cerrarMesAction({
      accountId:     res.accountId,
      year:          res.year,
      month:         res.month,
      saldoInicial:  res.saldoInicial,
      totalIngresos: res.totalIngresos,
      totalEgresos:  res.totalEgresos,
      saldoFinal:    res.saldoFinal,
      conciliadas:   res.conciliados.length,
      sinRegistrar:  res.sinRegistrar.length,
      sinConfirmar:  res.sinConfirmar.length,
    })
    setClosing(false)
    if (r.ok) { backToList(); router.refresh() }
    else alert(r.error ?? 'No se pudo cerrar el mes')
  }

  const diff    = res ? res.saldoFinal - res.saldoApp : 0
  const puedeCerrar = res && (Math.abs(diff) === 0 || acepta)

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA: LISTA (acordeón)
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="p-4 md:p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/bancos" className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors"><ArrowLeft size={18} /></Link>
            <div>
              <h1 className="text-lg font-semibold text-[#0F172A] flex items-center gap-2">
                <GitMerge size={18} className="text-[#2563EB]" /> Conciliación bancaria
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">Concilia cada mes contra el extracto de Bancolombia y cierra los meses cuadrados.</p>
            </div>
          </div>
          <button onClick={() => startNueva()}
            className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={15} /> Nueva conciliación
          </button>
        </div>

        {accounts.length > 1 && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-semibold text-[#64748B]">Cuenta:</span>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm bg-white text-[#0F172A]">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_number ? ` — ****${a.account_number.slice(-4)}` : ''}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-2">
          {months.map(({ year, month }) => {
            const key = `${year}_${month}`
            const rec = reconFor(year, month)
            const isClosed = rec?.status === 'CONCILIADO'
            const open = expandedKey === key
            const absDiff = Math.abs(rec?.diferencia ?? 0)
            const diffColor = absDiff === 0 ? 'text-green-600' : absDiff <= 10000 ? 'text-yellow-600' : 'text-red-600'
            return (
              <div key={key} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <button onClick={() => setExpandedKey(open ? null : key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors text-left">
                  {open ? <ChevronDown size={15} className="text-[#94A3B8] shrink-0" /> : <ChevronRight size={15} className="text-[#94A3B8] shrink-0" />}
                  <span className="font-semibold text-[#0F172A] text-sm w-36 shrink-0">{mesLabel(month)} {year}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${
                    isClosed ? 'bg-green-100 text-green-700' : rec ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isClosed && <Lock size={9} />}{isClosed ? 'CONCILIADO' : rec ? 'EN PROCESO' : 'PENDIENTE'}
                  </span>
                  <span className="flex-1" />
                  {rec && (
                    <>
                      <span className="text-xs text-[#64748B] tabular-nums hidden sm:inline">Saldo {formatCOP(rec.saldoFinal)}</span>
                      <span className={`text-xs font-semibold tabular-nums w-24 text-right ${diffColor}`}>
                        {absDiff === 0 ? 'Cuadrado' : `Δ ${formatCOP(absDiff)}`}
                      </span>
                    </>
                  )}
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#F1F5F9]">
                    {isClosed && rec ? (
                      <div className="space-y-3 pt-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Saldo inicial', value: formatCOP(rec.saldoInicial) },
                            { label: 'Ingresos',      value: formatCOP(rec.totalIngresos) },
                            { label: 'Egresos',       value: formatCOP(rec.totalEgresos) },
                            { label: 'Saldo final',   value: formatCOP(rec.saldoFinal) },
                          ].map(s => (
                            <div key={s.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5">
                              <p className="text-[10px] text-[#94A3B8]">{s.label}</p>
                              <p className="text-sm font-bold text-[#0F172A] tabular-nums mt-0.5">{s.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={12} /> {rec.conciliadas} conciliadas</span>
                          <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} /> {rec.sinRegistrar} sin registrar</span>
                          <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {rec.sinConfirmar} sin confirmar</span>
                          <span className="text-[#94A3B8] ml-auto">
                            Saldo app {formatCOP(rec.appSaldoFinal)} · Diferencia <span className={diffColor}>{formatCOP(rec.diferencia)}</span>
                          </span>
                        </div>
                        {rec.closedAt && (
                          <p className="text-[11px] text-[#94A3B8] flex items-center gap-1">
                            <Lock size={10} /> Cerrado el {formatDate(rec.closedAt.slice(0, 10))} · solo lectura
                          </p>
                        )}
                      </div>
                    ) : rec ? (
                      <div className="space-y-3 pt-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Saldo inicial', value: formatCOP(rec.saldoInicial) },
                            { label: 'Ingresos',      value: formatCOP(rec.totalIngresos) },
                            { label: 'Egresos',       value: formatCOP(rec.totalEgresos) },
                            { label: 'Saldo final',   value: formatCOP(rec.saldoFinal) },
                          ].map(s => (
                            <div key={s.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5">
                              <p className="text-[10px] text-[#94A3B8]">{s.label}</p>
                              <p className="text-sm font-bold text-[#0F172A] tabular-nums mt-0.5">{s.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={12} /> {rec.conciliadas} conciliadas</span>
                          <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} /> {rec.sinRegistrar} sin registrar</span>
                          <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {rec.sinConfirmar} sin confirmar</span>
                          <button onClick={() => loadSaved(rec)}
                            className="ml-auto text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0">
                            Abrir conciliación
                          </button>
                        </div>
                        <p className="text-[11px] text-[#94A3B8]">Guardado sin cerrar · puedes continuar o recargar el extracto.</p>
                      </div>
                    ) : (
                      <div className="pt-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#64748B]">Este mes aún no se ha conciliado.</p>
                        <button onClick={() => startNueva(year, month)}
                          className="text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0">
                          Conciliar este mes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA: NUEVA CONCILIACIÓN (flujo)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={backToList} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A] flex items-center gap-2">
              <GitMerge size={18} className="text-[#2563EB]" /> Nueva conciliación
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">Selecciona el mes, sube el extracto y cruza contra las transacciones de ese mes.</p>
          </div>
        </div>
      </div>

      {/* Selector de mes/año + cuenta */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 flex items-center gap-1"><Calendar size={12} /> Mes</label>
          <select value={flowMonth} onChange={e => { setFlowMonth(parseInt(e.target.value)); setResult(null) }}
            disabled={!!res}
            className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]">
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Año</label>
          <select value={flowYear} onChange={e => { setFlowYear(parseInt(e.target.value)); setResult(null) }}
            disabled={!!res}
            className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {accounts.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Cuenta</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} disabled={!!res}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A] disabled:bg-[#F8FAFC]">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_number ? ` — ****${a.account_number.slice(-4)}` : ''}</option>)}
            </select>
          </div>
        )}
        {reconFor(flowYear, flowMonth)?.status === 'CONCILIADO' && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-2 inline-flex items-center gap-1">
            <Lock size={11} /> Mes ya conciliado
          </span>
        )}
      </div>

      {/* Dropzone */}
      {!res && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer text-center transition-all mb-5 ${
            dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-[#E2E8F0] hover:border-blue-300 hover:bg-[#F8FAFC]'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet size={36} className="text-green-600" />
              <p className="text-sm font-semibold text-green-700">{file.name}</p>
              <p className="text-xs text-[#64748B] mt-1">Haz clic para cambiar el archivo</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
              <Upload size={36} />
              <p className="text-sm font-medium text-[#64748B]">Arrastra el extracto de Bancolombia aquí o haz clic</p>
              <p className="text-xs">Extracto del mes seleccionado (.xlsx o .xls)</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {result && !result.ok && !(result as any).needsAccount && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Error al procesar el archivo</p>
          <p className="text-sm text-red-600">{(result as any).error}</p>
          <button onClick={() => setResult(null)} className="mt-2 text-xs text-red-600 underline hover:no-underline">Intentar de nuevo</button>
        </div>
      )}

      {/* Cuenta ambigua */}
      {needsAccounts && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-yellow-800">No se identificó la cuenta automáticamente</p>
          <p className="text-xs text-yellow-700">Número en el extracto: <span className="font-mono font-bold">{acctRaw || '(no encontrado)'}</span>.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A]">
              <option value="">Seleccionar cuenta…</option>
              {needsAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_number ? ` — ****${a.account_number.slice(-4)}` : ''}</option>)}
            </select>
            <button onClick={() => run(accountId)} disabled={!accountId || processing}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {processing ? 'Procesando…' : 'Conciliar'}
            </button>
          </div>
        </div>
      )}

      {/* Botón procesar */}
      {file && !res && !needsAccounts && (
        <button onClick={() => run()} disabled={processing}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors mb-6">
          <GitMerge size={15} />
          {processing ? 'Procesando extracto…' : `Conciliar ${mesLabel(flowMonth)} ${flowYear}`}
        </button>
      )}

      {/* Resultados */}
      {res && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-blue-600 shrink-0" />
              <p className="text-sm font-semibold text-blue-800">{res.accountName} · {mesLabel(res.month)} {res.year}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-blue-600 font-mono mr-1">{formatDate(res.periodo.desde)} → {formatDate(res.periodo.hasta)}</p>
              <button onClick={recalcular} disabled={processing}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 border border-blue-300 hover:bg-blue-100 disabled:opacity-50 rounded-lg px-2.5 py-1 transition-colors inline-flex items-center gap-1">
                <RefreshCw size={11} className={processing ? 'animate-spin' : ''} /> {processing ? 'Recalculando…' : 'Recalcular'}
              </button>
              <button onClick={recargarExtracto} disabled={processing}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 border border-blue-300 hover:bg-blue-100 disabled:opacity-50 rounded-lg px-2.5 py-1 transition-colors inline-flex items-center gap-1">
                <Upload size={11} /> Recargar extracto
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: CheckCircle2, label: 'Conciliadas', count: res.conciliados.length, bg: 'bg-green-50 border-green-200', textCls: 'text-green-700', note: 'en banco y app', onClick: () => setShowConciliados(v => !v) },
              { icon: AlertTriangle, label: 'Sin registrar', count: res.sinRegistrar.length, bg: res.sinRegistrar.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-[#F8FAFC] border-[#E2E8F0]', textCls: res.sinRegistrar.length > 0 ? 'text-yellow-700' : 'text-[#64748B]', note: 'en banco, no en app', onClick: undefined },
              { icon: XCircle, label: 'Sin confirmar', count: res.sinConfirmar.length, bg: res.sinConfirmar.length > 0 ? 'bg-red-50 border-red-200' : 'bg-[#F8FAFC] border-[#E2E8F0]', textCls: res.sinConfirmar.length > 0 ? 'text-red-600' : 'text-[#64748B]', note: 'en app, no en banco', onClick: undefined },
            ].map(({ icon: Icon, label, count, bg, textCls, note, onClick }) => (
              <div key={label} onClick={onClick} className={`border rounded-xl p-4 ${bg} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
                <div className="flex items-center gap-2 mb-1"><Icon size={14} className={textCls} /><span className={`text-[10px] font-semibold uppercase tracking-wider ${textCls}`}>{label}</span></div>
                <p className={`text-2xl font-bold ${textCls}`}>{count}</p>
                <p className={`text-[10px] mt-0.5 ${textCls} opacity-80`}>{note}</p>
              </div>
            ))}
          </div>

          <SaldoResumen saldoFinal={res.saldoFinal} saldoApp={res.saldoApp} />

          {/* Sin registrar */}
          {res.sinRegistrar.length > 0 && (
            <div className="bg-white border border-yellow-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-yellow-50 border-b-yellow-200">
                <p className="text-xs font-semibold text-yellow-800">⚠️ Sin registrar ({res.sinRegistrar.length})<span className="ml-2 font-normal opacity-80">En el banco pero no en la app</span></p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-[#E2E8F0] bg-yellow-50/30">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Descripción</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Tipo</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Monto</th>
                    <th className="px-3 py-2" />
                  </tr></thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {res.sinRegistrar.map((row, i) => (
                      <tr key={i} className="hover:bg-yellow-50/30 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(row.fecha)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs truncate">{row.descripcion}</td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${row.tipo === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{row.tipo}</span></td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}</td>
                        <td className="px-3 py-2"><button onClick={() => setRegistrarRow(row)} className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">Registrar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sin confirmar */}
          {res.sinConfirmar.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-red-50 border-b-red-200">
                <p className="text-xs font-semibold text-red-700">🔴 Sin confirmar ({res.sinConfirmar.length})<span className="ml-2 font-normal opacity-80">En la app pero no en el extracto</span></p>
              </div>
              {Math.abs(diff) < 15000 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  La diferencia puede deberse a redondeos en GMF — revisa si los montos son similares al extracto
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-[#E2E8F0] bg-red-50/20">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Descripción</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Tipo</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Monto</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {res.sinConfirmar.map(t => (
                      <tr key={t.id} className="hover:bg-red-50/20 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B] align-top">{formatDate(t.date)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs">
                          <span className="block truncate">{t.description}</span>
                          {t.nota && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              <AlertTriangle size={9} /> {t.nota}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${t.type === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{t.type}</span></td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{t.type === 'EGRESO' ? '−' : '+'}{formatCOP(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conciliadas (colapsable) */}
          <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
            <button onClick={() => setShowConciliados(v => !v)} className="w-full bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between hover:bg-green-100 transition-colors">
              <p className="text-xs font-semibold text-green-800">✅ Conciliadas ({res.conciliados.length})<span className="ml-2 font-normal text-green-700">coinciden en banco y app</span></p>
              {showConciliados ? <ChevronDown size={14} className="text-green-600" /> : <ChevronRight size={14} className="text-green-600" />}
            </button>
            {showConciliados && res.conciliados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-[#E2E8F0] bg-green-50/20">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Fecha banco</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Descripción banco</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Monto</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Descripción app</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {res.conciliados.map((item, i) => (
                      <tr key={i} className="hover:bg-green-50/20 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(item.extracto.fecha)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.extracto.descripcion}</td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${item.extracto.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{item.extracto.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(item.extracto.monto)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.app.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cerrar mes */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            {Math.abs(diff) !== 0 && (
              <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-[#64748B]">
                  Hay una diferencia de <span className="font-semibold text-red-600">{formatCOP(Math.abs(diff))}</span>. Estoy de acuerdo con la diferencia y quiero cerrar el mes de todos modos.
                </span>
              </label>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleCerrar} disabled={!puedeCerrar || closing}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
                <Lock size={15} /> {closing ? 'Cerrando…' : 'Cerrar mes'}
              </button>
              <button onClick={backToList} className="border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] text-xs font-medium px-4 py-2 rounded-xl transition-colors">Volver</button>
              {Math.abs(diff) === 0 && <span className="text-xs text-green-600 font-medium">✅ Saldo cuadrado — listo para cerrar</span>}
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar */}
      {registrarRow && res && (
        <RegistrarModal
          row={registrarRow}
          accountId={res.accountId}
          categories={categories}
          pucAccounts={pucAccounts}
          onClose={() => setRegistrarRow(null)}
          onDone={() => { setRegistrarRow(null); refreshCross() }}
        />
      )}
    </div>
  )
}
