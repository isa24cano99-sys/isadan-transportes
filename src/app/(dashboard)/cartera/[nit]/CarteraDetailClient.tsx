'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, Minus, Trash2, ChevronDown } from 'lucide-react'
import { marcarPagadaAction, aplicarAbonoAction, eliminarEntradaAction } from '../actions'
import type { CarteraEntry } from './page'
import { formatInvoiceNumber } from '@/lib/utils'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

const STATUS_CONFIG: Record<CarteraEntry['status'], { label: string; cls: string; icon: React.ElementType }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200', icon: Clock },
  ABONADA:   { label: 'Abonada',   cls: 'bg-blue-100 text-blue-800 border border-blue-200',     icon: Minus },
  PAGADA:    { label: 'Pagada',    cls: 'bg-green-100 text-green-800 border border-green-200',  icon: CheckCircle2 },
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00'))
}

function PayModal({ entryId, invoiceNumber, balance, onClose }: {
  entryId: string; invoiceNumber: string | null; balance: number; onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode]     = useState<'full' | 'partial'>('full')
  const [date, setDate]     = useState(() => new Date().toISOString().substring(0, 10))
  const [monto, setMonto]   = useState(String(balance))
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    let res: { ok: boolean; error?: string }
    if (mode === 'full') {
      res = await marcarPagadaAction(entryId, date)
    } else {
      const m = parseFloat(monto)
      if (!m || m <= 0) { setError('Ingresa un monto válido'); setLoading(false); return }
      res = await aplicarAbonoAction(entryId, m)
    }
    setLoading(false)
    if (!res.ok) { setError(res.error ?? 'Error'); return }
    onClose()
    setTimeout(() => router.refresh(), 300)
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB]'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-[#0F172A] mb-1">Registrar pago</h2>
        {invoiceNumber && (
          <p className="text-xs text-[#64748B] mb-4">Factura {formatInvoiceNumber(invoiceNumber)} · Saldo: {fmt(balance)}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Mode */}
          <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden">
            {(['full', 'partial'] as const).map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-[#E2E8F0]' : ''} ${
                  mode === m ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
                }`}
              >
                {m === 'full' ? 'Pago total' : 'Abono parcial'}
              </button>
            ))}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha de pago</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputCls} />
          </div>

          {/* Monto (partial only) */}
          {mode === 'partial' && (
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Monto abonado (COP)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                required
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {mode === 'full' ? 'Marcar pagada' : 'Aplicar abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CarteraDetailClient({ entries }: { entries: CarteraEntry[] }) {
  const router = useRouter()
  const [payModal, setPayModal]     = useState<CarteraEntry | null>(null)
  const [deleting, setDeleting]     = useState<Set<string>>(new Set())
  const [showPaid, setShowPaid]     = useState(false)

  const unpaid = entries.filter(e => e.status !== 'PAGADA')
  const paid   = entries.filter(e => e.status === 'PAGADA')
  const shown  = showPaid ? entries : unpaid

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta entrada de cartera?')) return
    setDeleting(p => { const n = new Set(p); n.add(id); return n })
    await eliminarEntradaAction(id)
    setDeleting(p => { const n = new Set(p); n.delete(id); return n })
    router.refresh()
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
        <p className="text-sm text-[#64748B]">No hay entradas de cartera para este cliente.</p>
      </div>
    )
  }

  return (
    <>
      {payModal && (
        <PayModal
          entryId={payModal.id}
          invoiceNumber={payModal.invoiceNumber}
          balance={payModal.balance}
          onClose={() => setPayModal(null)}
        />
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2">
          <span className="text-xs text-[#64748B]">
            {unpaid.length} factura{unpaid.length !== 1 ? 's' : ''} pendiente{unpaid.length !== 1 ? 's' : ''}
            {paid.length > 0 && ` · ${paid.length} pagada${paid.length !== 1 ? 's' : ''}`}
          </span>
          {paid.length > 0 && (
            <button
              onClick={() => setShowPaid(p => !p)}
              className="ml-auto text-xs text-[#64748B] hover:text-[#0F172A] flex items-center gap-1"
            >
              {showPaid ? 'Ocultar pagadas' : 'Mostrar pagadas'}
              <ChevronDown size={12} className={`transition-transform ${showPaid ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9]">
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Factura</th>
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Fecha</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Valor</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Anticipo</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Saldo</th>
                <th className="text-center py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Estado</th>
                <th className="py-2.5 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {shown.map(entry => {
                const sc    = STATUS_CONFIG[entry.status]
                const isDel = deleting.has(entry.id)
                const Icon  = sc.icon
                return (
                  <tr key={entry.id} className={`hover:bg-[#F8FAFC] transition-colors ${entry.status === 'PAGADA' ? 'opacity-60' : ''}`}>
                    <td className="py-2.5 px-4 font-mono text-sm font-medium text-[#0F172A]">
                      {entry.invoiceNumber ? formatInvoiceNumber(entry.invoiceNumber) : '(sin número)'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-[#64748B]">{fmtDate(entry.invoiceDate)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#0F172A]">{fmt(entry.invoiceAmount)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#64748B]">
                      {entry.advanceAmount > 0 ? fmt(entry.advanceAmount) : '—'}
                    </td>
                    <td className={`py-2.5 px-4 text-right tabular-nums font-semibold ${
                      entry.balance <= 0 ? 'text-green-600' : 'text-yellow-700'
                    }`}>
                      {fmt(Math.max(0, entry.balance))}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>
                        <Icon size={10} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {entry.status !== 'PAGADA' && (
                          <button
                            onClick={() => setPayModal(entry)}
                            className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={isDel}
                          className="p-1 text-[#94A3B8] hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          {isDel ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
