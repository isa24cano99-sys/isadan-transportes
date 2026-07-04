'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle,
  AlertTriangle, XCircle, ChevronDown, ChevronRight, X, Trash2,
} from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import CategorySelector from '@/components/CategorySelector'
import type { PucAccount } from '@/components/PucSelector'
import {
  conciliarExtractoAction,
  limpiarExtractoBancolombia,
  type ConciliacionResult,
  type AccountOption,
  type ExtractoRow,
} from './actions'
import { crearTransaccionAction } from '../transaccion/actions'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

function RegistrarModal({
  row,
  accountId,
  categories,
  pucAccounts,
  onClose,
  onRegistered,
}: {
  row: ExtractoRow
  accountId: string
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  onClose: () => void
  onRegistered: (row: ExtractoRow) => void
}) {
  const [desc,       setDesc]       = useState(row.descripcion)
  const [categoryId, setCategoryId] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const handleSubmit = async () => {
    if (!categoryId) { setError('Selecciona una categoría'); return }
    setSaving(true)
    setError('')
    const fd = new FormData()
    fd.set('account_id',  accountId)
    fd.set('type',        row.tipo)
    fd.set('amount',      String(row.monto))
    fd.set('date',        row.fecha)
    fd.set('category_id', categoryId)
    fd.set('description', desc)
    const res = await crearTransaccionAction(fd)
    if (res.ok) { onRegistered(row) }
    else { setError(res.error ?? 'Error al guardar'); setSaving(false) }
  }

  const inpCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#0F172A] text-sm">Registrar movimiento</h2>
          <button onClick={onClose}><X size={18} className="text-[#64748B]" /></button>
        </div>

        {/* Extracto data preview */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 mb-4 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">Fecha</span>
            <span className="font-mono text-[#0F172A]">{formatDate(row.fecha)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">Tipo</span>
            <span className={`font-semibold ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>{row.tipo}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">Monto</span>
            <span className={`font-bold ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
              {row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Descripción</label>
            <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} className={`${inpCls} resize-none`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría</label>
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
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-xs hover:bg-[#F8FAFC]">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-xs">
              {saving ? 'Guardando...' : 'Registrar transacción'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ImportarExtractoClient({
  categories,
  pucAccounts,
}: {
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragging,         setDragging]         = useState(false)
  const [file,             setFile]             = useState<File | null>(null)
  const [uploading,        setUploading]        = useState(false)
  const [result,           setResult]           = useState<ConciliacionResult | null>(null)
  const [needsAccounts,    setNeedsAccounts]    = useState<AccountOption[] | null>(null)
  const [acctNumFound,     setAcctNumFound]     = useState('')
  const [selectedAccount,  setSelectedAccount]  = useState('')
  const [showConciliados,  setShowConciliados]  = useState(false)
  const [registrarRow,     setRegistrarRow]     = useState<ExtractoRow | null>(null)
  const [sinRegistrarLocal,setSinRegistrarLocal]= useState<ExtractoRow[]>([])
  const [limpiarLoading,   setLimpiarLoading]   = useState(false)
  const [limpiarMsg,       setLimpiarMsg]       = useState('')

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Solo se aceptan archivos Excel (.xlsx o .xls)'); return }
    setFile(f)
    setResult(null)
    setNeedsAccounts(null)
    setLimpiarMsg('')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleSubmit = async (overrideAccountId?: string) => {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    if (overrideAccountId) fd.append('account_id', overrideAccountId)
    const res = await conciliarExtractoAction(fd)
    if (!res.ok && (res as any).needsAccount) {
      setNeedsAccounts((res as any).accounts)
      setAcctNumFound((res as any).acctNumRaw)
      setUploading(false)
      return
    }
    setResult(res)
    setNeedsAccounts(null)
    if (res.ok) setSinRegistrarLocal(res.sinRegistrar)
    setUploading(false)
  }

  const handleLimpiar = async () => {
    if (!confirm('¿Eliminar todas las transacciones importadas automáticamente desde el extracto?')) return
    setLimpiarLoading(true)
    const r = await limpiarExtractoBancolombia()
    setLimpiarMsg(r.ok
      ? `Se eliminaron ${r.deleted} transacción${r.deleted !== 1 ? 'es' : ''}.`
      : (r.error ?? 'Error al limpiar'))
    setLimpiarLoading(false)
  }

  const onRegistered = (row: ExtractoRow) => {
    setSinRegistrarLocal(prev => prev.filter(r => r !== row))
    setRegistrarRow(null)
  }

  const res     = result?.ok ? result : null
  const diff    = res ? res.saldoExtracto - res.saldoApp : 0
  const absDiff = Math.abs(diff)
  const diffColor   = absDiff === 0 ? 'text-green-600' : absDiff <= 10000 ? 'text-yellow-600' : 'text-red-600'
  const diffMessage = absDiff === 0
    ? '✅ Saldo cuadrado perfectamente'
    : absDiff <= 10000
    ? '⚠️ Diferencia menor, revisar redondeos'
    : '🔴 Diferencia significativa, revisar transacciones'

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/bancos" className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A]">Conciliar extracto Bancolombia</h1>
            <p className="text-xs text-[#64748B] mt-0.5">Compara el extracto contra las transacciones registradas en la app — sin insertar nada automáticamente</p>
          </div>
        </div>
        <button onClick={handleLimpiar} disabled={limpiarLoading}
          className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
          <Trash2 size={12} />
          {limpiarLoading ? 'Limpiando...' : 'Limpiar importaciones anteriores'}
        </button>
      </div>

      {limpiarMsg && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
          {limpiarMsg}
        </div>
      )}

      {/* Dropzone */}
      {!res && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer text-center transition-colors mb-4 ${
            dragging ? 'border-blue-400 bg-blue-50'
              : file ? 'border-green-400 bg-green-50'
              : 'border-[#E2E8F0] hover:border-blue-300 hover:bg-[#F8FAFC]'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet size={32} className="text-green-600" />
              <p className="text-sm font-semibold text-green-700">{file.name}</p>
              <p className="text-xs text-green-600">{(file.size / 1024).toFixed(0)} KB — listo para conciliar</p>
              <p className="text-xs text-[#64748B] mt-1">Haz clic para cambiar el archivo</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
              <Upload size={32} />
              <p className="text-sm font-medium text-[#64748B]">Arrastra el Excel aquí o haz clic para seleccionar</p>
              <p className="text-xs">Formato: extracto Bancolombia (.xlsx o .xls)</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {result && !result.ok && !(result as any).needsAccount && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Error al procesar el archivo</p>
          <p className="text-sm text-red-600">{(result as any).error}</p>
          <button onClick={() => { setResult(null); setFile(null) }}
            className="mt-3 text-xs text-red-600 underline hover:no-underline">
            Intentar con otro archivo
          </button>
        </div>
      )}

      {/* Account selector */}
      {needsAccounts && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-yellow-800">No se identificó la cuenta automáticamente</p>
          <p className="text-xs text-yellow-700">
            Número en el extracto: <span className="font-mono font-bold">{acctNumFound || '(no encontrado)'}</span>.
            Selecciona manualmente a qué cuenta pertenece:
          </p>
          <div className="flex items-center gap-3">
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
              <option value="">Seleccionar cuenta…</option>
              {needsAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.bank_name}{a.account_number ? ` — ****${a.account_number.slice(-4)}` : ''}
                </option>
              ))}
            </select>
            <button onClick={() => handleSubmit(selectedAccount)} disabled={!selectedAccount || uploading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {uploading ? 'Procesando…' : 'Conciliar'}
            </button>
          </div>
        </div>
      )}

      {/* Upload button */}
      {file && !res && !needsAccounts && (
        <button onClick={() => handleSubmit()} disabled={uploading}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors mb-6">
          <Upload size={15} />
          {uploading ? 'Procesando…' : 'Conciliar extracto'}
        </button>
      )}

      {/* Results */}
      {res && (
        <div className="space-y-4">
          {/* Account + period banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-blue-600 shrink-0" />
              <p className="text-xs text-blue-800 font-medium">{res.accountName}</p>
            </div>
            <p className="text-xs text-blue-600">
              {formatDate(res.periodo.desde)} → {formatDate(res.periodo.hasta)}
            </p>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className="bg-green-50 border border-green-200 rounded-xl p-4 cursor-pointer hover:bg-green-100 transition-colors"
              onClick={() => setShowConciliados(v => !v)}
            >
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={14} className="text-green-600" />
                <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Conciliados</span>
              </div>
              <p className="text-xl font-bold text-green-700">{res.conciliados.length}</p>
              <p className="text-[10px] text-green-600 mt-0.5">en banco y en app ↓ ver</p>
            </div>
            <div className={`border rounded-xl p-4 ${sinRegistrarLocal.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className={sinRegistrarLocal.length > 0 ? 'text-yellow-600' : 'text-[#94A3B8]'} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${sinRegistrarLocal.length > 0 ? 'text-yellow-700' : 'text-[#94A3B8]'}`}>Sin registrar</span>
              </div>
              <p className={`text-xl font-bold ${sinRegistrarLocal.length > 0 ? 'text-yellow-700' : 'text-[#64748B]'}`}>{sinRegistrarLocal.length}</p>
              <p className={`text-[10px] mt-0.5 ${sinRegistrarLocal.length > 0 ? 'text-yellow-600' : 'text-[#94A3B8]'}`}>en banco, no en app</p>
            </div>
            <div className={`border rounded-xl p-4 ${res.sinConfirmar.length > 0 ? 'bg-red-50 border-red-200' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <XCircle size={14} className={res.sinConfirmar.length > 0 ? 'text-red-500' : 'text-[#94A3B8]'} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${res.sinConfirmar.length > 0 ? 'text-red-600' : 'text-[#94A3B8]'}`}>Sin confirmar</span>
              </div>
              <p className={`text-xl font-bold ${res.sinConfirmar.length > 0 ? 'text-red-600' : 'text-[#64748B]'}`}>{res.sinConfirmar.length}</p>
              <p className={`text-[10px] mt-0.5 ${res.sinConfirmar.length > 0 ? 'text-red-500' : 'text-[#94A3B8]'}`}>en app, no en banco</p>
            </div>
          </div>

          {/* Saldo comparison */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-3">Comparación de saldos</p>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] text-[#94A3B8] mb-0.5">Según extracto banco</p>
                <p className="text-lg font-bold text-[#0F172A]">{formatCOP(res.saldoExtracto)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#94A3B8] mb-0.5">Según app</p>
                <p className="text-lg font-bold text-[#0F172A]">{formatCOP(res.saldoApp)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#94A3B8] mb-0.5">Diferencia</p>
                <p className={`text-lg font-bold ${diffColor}`}>
                  {absDiff === 0 ? '—' : (diff > 0 ? '+' : '') + formatCOP(diff)}
                </p>
              </div>
            </div>
            <p className={`text-xs font-medium mt-3 ${diffColor}`}>{diffMessage}</p>
          </div>

          {/* SIN REGISTRAR */}
          {sinRegistrarLocal.length > 0 && (
            <div className="bg-white border border-yellow-200 rounded-xl overflow-hidden">
              <div className="bg-yellow-50 px-4 py-2.5 border-b border-yellow-200">
                <p className="text-xs font-semibold text-yellow-800">
                  ⚠️ Sin registrar ({sinRegistrarLocal.length})
                  <span className="ml-2 font-normal text-yellow-700">En el banco pero no en la app — haz clic en "Registrar" para agregar</span>
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-yellow-50/40">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Monto</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {sinRegistrarLocal.map((row, i) => (
                    <tr key={i} className="hover:bg-yellow-50/30">
                      <td className="px-3 py-2 text-xs text-[#64748B] font-mono">{formatDate(row.fecha)}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs truncate">{row.descripcion}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${row.tipo === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {row.tipo}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-xs font-semibold text-right ${row.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
                        {row.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(row.monto)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => setRegistrarRow(row)}
                          className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-2.5 py-1 rounded-lg transition-colors">
                          Registrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SIN CONFIRMAR */}
          {res.sinConfirmar.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
              <div className="bg-red-50 px-4 py-2.5 border-b border-red-200">
                <p className="text-xs font-semibold text-red-700">
                  🔴 Sin confirmar ({res.sinConfirmar.length})
                  <span className="ml-2 font-normal text-red-600">En la app pero el banco no las muestra — verifica si son correctas</span>
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-red-50/30">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Descripción</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {res.sinConfirmar.map(t => (
                    <tr key={t.id} className="hover:bg-red-50/20">
                      <td className="px-3 py-2 text-xs text-[#64748B] font-mono">{formatDate(t.date)}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] max-w-xs truncate">{t.description}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.type === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-xs font-semibold text-right ${t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
                        {t.type === 'EGRESO' ? '−' : '+'}{formatCOP(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CONCILIADOS (collapsible) */}
          <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowConciliados(v => !v)}
              className="w-full bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between hover:bg-green-100 transition-colors"
            >
              <p className="text-xs font-semibold text-green-800">
                ✅ Conciliados ({res.conciliados.length})
                <span className="ml-2 font-normal text-green-700">coinciden en banco y app</span>
              </p>
              {showConciliados ? <ChevronDown size={14} className="text-green-600" /> : <ChevronRight size={14} className="text-green-600" />}
            </button>
            {showConciliados && res.conciliados.length > 0 && (
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
                <tbody className="divide-y divide-[#E2E8F0]">
                  {res.conciliados.map((item, i) => (
                    <tr key={i} className="hover:bg-green-50/20">
                      <td className="px-3 py-2 text-xs text-[#64748B] font-mono">{formatDate(item.extracto.fecha)}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.extracto.descripcion}</td>
                      <td className={`px-3 py-2 text-xs font-semibold text-right ${item.extracto.tipo === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
                        {item.extracto.tipo === 'EGRESO' ? '−' : '+'}{formatCOP(item.extracto.monto)}
                      </td>
                      <td className="px-3 py-2 text-xs text-[#64748B] font-mono">{formatDate(item.app.date)}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] max-w-[180px] truncate">{item.app.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link href={`/bancos/${res.accountId}`}
              className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
              Ver cuenta
            </Link>
            <button onClick={() => { setResult(null); setFile(null); setNeedsAccounts(null); setSelectedAccount('') }}
              className="border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] text-xs font-medium px-4 py-2 rounded-xl transition-colors">
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
          onRegistered={onRegistered}
        />
      )}
    </div>
  )
}
