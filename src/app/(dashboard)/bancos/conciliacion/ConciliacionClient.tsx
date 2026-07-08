'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronRight, X, GitMerge,
} from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import CategorySelector from '@/components/CategorySelector'
import type { PucAccount } from '@/components/PucSelector'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'
import {
  conciliarAction,
  type ConciliacionResult, type ExtractoRow, type AccountOption,
} from './actions'
import { crearTransaccionAction } from '../transaccion/actions'

// ── RegistrarModal ────────────────────────────────────────────────────────────

function RegistrarModal({
  row, accountId, categories, pucAccounts, onClose, onDone,
}: {
  row: ExtractoRow
  accountId: string
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  onClose: () => void
  onDone: (row: ExtractoRow) => void
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
    if (res.ok) onDone(row)
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

        {/* Preview */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[#94A3B8] mb-0.5">Fecha</p>
            <p className="font-mono text-[#0F172A]">{formatDate(row.fecha)}</p>
          </div>
          <div>
            <p className="text-[#94A3B8] mb-0.5">Tipo</p>
            <p className={`font-semibold ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{row.tipo}</p>
          </div>
          <div>
            <p className="text-[#94A3B8] mb-0.5">Monto</p>
            <p className={`font-bold tabular-nums ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
              {row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}
            </p>
          </div>
          <div className="col-span-3">
            <p className="text-[#94A3B8] mb-0.5">Descripción banco</p>
            <p className="text-[#64748B] truncate">{row.descripcion}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Descripción en la app</label>
            <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
              className={`${cls} resize-none`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría *</label>
            <CategorySelector
              value={categoryId}
              onChange={setCategoryId}
              categories={categories}
              pucAccounts={pucAccounts}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-xs hover:bg-[#F8FAFC] transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-xs transition-colors">
              {saving ? 'Guardando…' : 'Registrar transacción'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConciliacionClient({
  categories,
  pucAccounts,
}: {
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragging,        setDragging]        = useState(false)
  const [file,            setFile]            = useState<File | null>(null)
  const [processing,      setProcessing]      = useState(false)
  const [result,          setResult]          = useState<ConciliacionResult | null>(null)
  const [needsAccounts,   setNeedsAccounts]   = useState<AccountOption[] | null>(null)
  const [acctRaw,         setAcctRaw]         = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [showConciliados, setShowConciliados] = useState(false)
  const [registrarRow,    setRegistrarRow]    = useState<ExtractoRow | null>(null)
  const [sinReg,          setSinReg]          = useState<ExtractoRow[]>([])

  const res = result?.ok ? result : null

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      alert('Solo se aceptan archivos Excel (.xlsx o .xls)')
      return
    }
    setFile(f)
    setResult(null)
    setNeedsAccounts(null)
    setAcctRaw('')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const run = async (overrideId?: string) => {
    if (!file) return
    setProcessing(true)
    const fd = new FormData()
    fd.append('file', file)
    if (overrideId) fd.append('account_id', overrideId)
    const r = await conciliarAction(fd)
    if (!r.ok && (r as any).needsAccount) {
      setNeedsAccounts((r as any).accounts)
      setAcctRaw((r as any).acctNumRaw)
      setProcessing(false)
      return
    }
    setResult(r)
    setNeedsAccounts(null)
    if (r.ok) setSinReg(r.sinRegistrar)
    setProcessing(false)
  }

  const reset = () => {
    setResult(null)
    setFile(null)
    setNeedsAccounts(null)
    setSelectedAccount('')
    setSinReg([])
    setShowConciliados(false)
  }

  const diff      = res ? res.saldoExtracto - res.saldoApp : 0
  const absDiff   = Math.abs(diff)
  const diffColor = absDiff === 0 ? 'text-green-600' : absDiff <= 10000 ? 'text-yellow-600' : 'text-red-600'

  const SectionHeader = ({
    icon, count, title, note, bg, textCls,
  }: {
    icon: string; count: number; title: string; note: string; bg: string; textCls: string
  }) => (
    <div className={`px-4 py-2.5 border-b flex items-center justify-between ${bg}`}>
      <p className={`text-xs font-semibold ${textCls}`}>
        {icon} {title} ({count})
        <span className="ml-2 font-normal opacity-80">{note}</span>
      </p>
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/bancos"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A] flex items-center gap-2">
              <GitMerge size={18} className="text-[#2563EB]" />
              Conciliación bancaria
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Sube el extracto de Bancolombia y cruza contra las transacciones registradas
            </p>
          </div>
        </div>
        {res && (
          <button onClick={reset}
            className="text-xs text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0] rounded-lg px-3 py-2 hover:bg-[#F8FAFC] transition-colors">
            Nuevo extracto
          </button>
        )}
      </div>

      {/* ── Dropzone (shown until we have results) ── */}
      {!res && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer text-center transition-all mb-5 ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : file
              ? 'border-green-400 bg-green-50'
              : 'border-[#E2E8F0] hover:border-blue-300 hover:bg-[#F8FAFC]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet size={36} className="text-green-600" />
              <p className="text-sm font-semibold text-green-700">{file.name}</p>
              <p className="text-xs text-green-600">{(file.size / 1024).toFixed(0)} KB</p>
              <p className="text-xs text-[#64748B] mt-1">Haz clic para cambiar el archivo</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
              <Upload size={36} />
              <p className="text-sm font-medium text-[#64748B]">Arrastra el Excel aquí o haz clic para seleccionar</p>
              <p className="text-xs">Extracto Bancolombia (.xlsx o .xls)</p>
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {result && !result.ok && !(result as any).needsAccount && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Error al procesar el archivo</p>
          <p className="text-sm text-red-600">{(result as any).error}</p>
          <button onClick={() => setResult(null)}
            className="mt-2 text-xs text-red-600 underline hover:no-underline">
            Intentar con otro archivo
          </button>
        </div>
      )}

      {/* ── Account picker (ambiguous) ── */}
      {needsAccounts && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-yellow-800">No se identificó la cuenta automáticamente</p>
          <p className="text-xs text-yellow-700">
            Número en el extracto: <span className="font-mono font-bold">{acctRaw || '(no encontrado)'}</span>.
            Selecciona la cuenta manualmente:
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Seleccionar cuenta…</option>
              {needsAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.bank_name}{a.account_number ? ` — ****${a.account_number.slice(-4)}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => run(selectedAccount)}
              disabled={!selectedAccount || processing}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {processing ? 'Procesando…' : 'Conciliar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Process button ── */}
      {file && !res && !needsAccounts && (
        <button
          onClick={() => run()}
          disabled={processing}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors mb-6"
        >
          <GitMerge size={15} />
          {processing ? 'Procesando extracto…' : 'Conciliar extracto'}
        </button>
      )}

      {/* ── Results ── */}
      {res && (
        <div className="space-y-4">

          {/* Account + period banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-blue-600 shrink-0" />
              <p className="text-sm font-semibold text-blue-800">{res.accountName}</p>
            </div>
            <p className="text-xs text-blue-600 font-mono">
              {formatDate(res.periodo.desde)} → {formatDate(res.periodo.hasta)}
            </p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: CheckCircle2, label: 'Conciliados', count: res.conciliados.length,
                bg: 'bg-green-50 border-green-200', iconCls: 'text-green-600',
                textCls: 'text-green-700', note: 'en banco y app',
                onClick: () => setShowConciliados(v => !v),
              },
              {
                icon: AlertTriangle, label: 'Sin registrar', count: sinReg.length,
                bg: sinReg.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-[#F8FAFC] border-[#E2E8F0]',
                iconCls: sinReg.length > 0 ? 'text-yellow-600' : 'text-[#94A3B8]',
                textCls: sinReg.length > 0 ? 'text-yellow-700' : 'text-[#64748B]',
                note: 'en banco, no en app',
                onClick: undefined,
              },
              {
                icon: XCircle, label: 'Sin confirmar', count: res.sinConfirmar.length,
                bg: res.sinConfirmar.length > 0 ? 'bg-red-50 border-red-200' : 'bg-[#F8FAFC] border-[#E2E8F0]',
                iconCls: res.sinConfirmar.length > 0 ? 'text-red-500' : 'text-[#94A3B8]',
                textCls: res.sinConfirmar.length > 0 ? 'text-red-600' : 'text-[#64748B]',
                note: 'en app, no en banco',
                onClick: undefined,
              },
            ].map(({ icon: Icon, label, count, bg, iconCls, textCls, note, onClick }) => (
              <div
                key={label}
                onClick={onClick}
                className={`border rounded-xl p-4 ${bg} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={iconCls} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${textCls}`}>{label}</span>
                </div>
                <p className={`text-2xl font-bold ${textCls}`}>{count}</p>
                <p className={`text-[10px] mt-0.5 ${textCls} opacity-80`}>{note}</p>
              </div>
            ))}
          </div>

          {/* Saldo comparison */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-3">
              Comparación de saldos al {formatDate(res.periodo.hasta)}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Según extracto banco', value: res.saldoExtracto, cls: 'text-[#0F172A]' },
                { label: 'Según app',            value: res.saldoApp,       cls: 'text-[#0F172A]' },
                {
                  label: 'Diferencia',
                  value: diff,
                  cls:   diffColor,
                  prefix: absDiff === 0 ? undefined : diff > 0 ? '+' : '',
                },
              ].map(({ label, value, cls, prefix }) => (
                <div key={label}>
                  <p className="text-[10px] text-[#94A3B8] mb-0.5">{label}</p>
                  <p className={`text-base md:text-lg font-bold tabular-nums ${cls}`}>
                    {absDiff === 0 && label === 'Diferencia'
                      ? '—'
                      : `${prefix ?? ''}${formatCOP(Math.abs(value))}`}
                  </p>
                </div>
              ))}
            </div>
            <p className={`text-xs font-medium mt-3 ${diffColor}`}>
              {absDiff === 0
                ? '✅ Saldo cuadrado perfectamente'
                : absDiff <= 10000
                ? '⚠️ Diferencia menor — posible redondeo'
                : '🔴 Diferencia significativa — revisar transacciones'}
            </p>
          </div>

          {/* ── SIN REGISTRAR ── */}
          {sinReg.length > 0 && (
            <div className="bg-white border border-yellow-200 rounded-xl overflow-hidden">
              <SectionHeader
                icon="⚠️"
                count={sinReg.length}
                title="Sin registrar"
                note="En el banco pero no en la app — haz clic en Registrar para agregar"
                bg="bg-yellow-50 border-b-yellow-200"
                textCls="text-yellow-800"
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-yellow-50/30">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Monto</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {sinReg.map((row, i) => (
                      <tr key={i} className="hover:bg-yellow-50/30 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(row.fecha)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs truncate">{row.descripcion}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            row.tipo === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                          }`}>
                            {row.tipo}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${
                          row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setRegistrarRow(row)}
                            className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          >
                            Registrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SIN CONFIRMAR ── */}
          {res.sinConfirmar.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
              <SectionHeader
                icon="🔴"
                count={res.sinConfirmar.length}
                title="Sin confirmar"
                note="En la app pero no en el extracto — verifica si son correctas"
                bg="bg-red-50 border-b-red-200"
                textCls="text-red-700"
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-red-50/20">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {res.sinConfirmar.map(t => (
                      <tr key={t.id} className="hover:bg-red-50/20 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(t.date)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs truncate">{t.description}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            t.type === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                          }`}>
                            {t.type}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${
                          t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {t.type === 'EGRESO' ? '−' : '+'}{formatCOP(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CONCILIADOS (collapsible) ── */}
          <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowConciliados(v => !v)}
              className="w-full bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between hover:bg-green-100 transition-colors"
            >
              <p className="text-xs font-semibold text-green-800">
                ✅ Conciliados ({res.conciliados.length})
                <span className="ml-2 font-normal text-green-700">coinciden en banco y app</span>
              </p>
              {showConciliados
                ? <ChevronDown size={14} className="text-green-600" />
                : <ChevronRight size={14} className="text-green-600" />}
            </button>
            {showConciliados && res.conciliados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-green-50/20">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha banco</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción banco</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Monto</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha app</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción app</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {res.conciliados.map((item, i) => (
                      <tr key={i} className="hover:bg-green-50/20 transition-colors">
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(item.extracto.fecha)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.extracto.descripcion}</td>
                        <td className={`px-3 py-2 text-xs font-semibold text-right tabular-nums ${
                          item.extracto.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {item.extracto.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(item.extracto.monto)}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{formatDate(item.app.date)}</td>
                        <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.app.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link
              href={`/bancos/${res.accountId}`}
              className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Ver cuenta
            </Link>
            <button
              onClick={reset}
              className="border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] text-xs font-medium px-4 py-2 rounded-xl transition-colors"
            >
              Conciliar otro extracto
            </button>
          </div>
        </div>
      )}

      {/* Registrar modal */}
      {registrarRow && res && (
        <RegistrarModal
          row={registrarRow}
          accountId={res.accountId}
          categories={categories}
          pucAccounts={pucAccounts}
          onClose={() => setRegistrarRow(null)}
          onDone={row => { setSinReg(prev => prev.filter(r => r !== row)); setRegistrarRow(null) }}
        />
      )}
    </div>
  )
}
