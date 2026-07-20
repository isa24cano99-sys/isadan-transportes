'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, Minus, Trash2, ChevronDown, Wallet } from 'lucide-react'
import { marcarPagadaAction, aplicarAbonoAction, eliminarEntradaAction, registrarPagoMultipleAction, type ClientPayment } from '../actions'
import type { CarteraEntry, UnappliedAnticipo } from './page'
import { formatInvoiceNumber } from '@/lib/utils'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

const STATUS_CONFIG: Record<CarteraEntry['status'], { label: string; cls: string; icon: React.ElementType }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200', icon: Clock },
  ABONADA:   { label: 'Parcial',   cls: 'bg-blue-100 text-blue-800 border border-blue-200',     icon: Minus },
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

function MultiPayModal({ entries, clientName, clientNit, onClose }: {
  entries: CarteraEntry[]; clientName: string; clientNit: string | null; onClose: () => void
}) {
  const router = useRouter()
  const unpaid = entries.filter(e => e.status !== 'PAGADA' && e.balance > 0)
  const [selected, setSelected] = useState<Set<string>>(new Set(unpaid.map(e => e.id)))
  const [monto, setMonto]   = useState('')
  const [date, setDate]     = useState(() => new Date().toISOString().substring(0, 10))
  const [desc, setDesc]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const selectedEntries = unpaid.filter(e => selected.has(e.id))
  const selectedTotal   = selectedEntries.reduce((s, e) => s + Math.max(0, e.balance), 0)
  const montoNum        = parseFloat(monto) || 0
  const insuficiente    = montoNum > 0 && selectedTotal > montoNum
  const saldoAFavor     = montoNum > selectedTotal ? montoNum - selectedTotal : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (montoNum <= 0)       { setError('Ingresa el monto del pago.'); return }
    if (selected.size === 0) { setError('Selecciona al menos una factura.'); return }
    setLoading(true); setError('')
    const res = await registrarPagoMultipleAction({
      clientNit, clientName, amount: montoNum, paymentDate: date, description: desc, entryIds: [...selected],
    })
    setLoading(false)
    if (!res.ok) { setError(res.error ?? 'Error al registrar el pago'); return }
    onClose()
    setTimeout(() => router.refresh(), 300)
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB]'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Registrar pago</h2>
          <p className="text-xs text-[#64748B] mt-0.5">{clientName} · un pago que cubre varias facturas</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Monto del pago (COP)</label>
                <input type="number" min="1" step="1" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha del pago</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Descripción</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Pago liquidaciones MAN27401, MAN27440…" className={inputCls} />
            </div>

            {/* Facturas pendientes con checkbox */}
            <div>
              <p className="text-xs font-semibold text-[#64748B] mb-2">Facturas que cubre este pago</p>
              <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#F1F5F9] max-h-52 overflow-y-auto">
                {unpaid.length === 0 ? (
                  <p className="text-xs text-[#94A3B8] p-3">No hay facturas pendientes.</p>
                ) : unpaid.map(e => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-[#F8FAFC] cursor-pointer">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)}
                      className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]" />
                    <span className="font-mono text-xs font-medium text-[#0F172A] w-16">{e.invoiceNumber ? formatInvoiceNumber(e.invoiceNumber) : '—'}</span>
                    <span className="text-xs text-[#64748B] w-20">{fmtDate(e.invoiceDate)}</span>
                    <span className="text-xs text-[#94A3B8] flex-1 text-right tabular-nums">{fmt(e.invoiceAmount)}</span>
                    <span className="text-xs font-semibold text-yellow-700 w-24 text-right tabular-nums">saldo {fmt(Math.max(0, e.balance))}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Resumen selección vs pago */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[#64748B]">Total seleccionado</span><span className="tabular-nums text-[#0F172A]">{fmt(selectedTotal)}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Monto del pago</span><span className="tabular-nums text-[#0F172A]">{fmt(montoNum)}</span></div>
              {insuficiente && (
                <p className="text-xs font-semibold text-red-600 pt-1">⚠ El pago no cubre todas las facturas seleccionadas ({fmt(selectedTotal - montoNum)} faltante).</p>
              )}
              {saldoAFavor > 0 && (
                <p className="text-xs font-semibold text-green-700 pt-1">Saldo a favor del cliente: {fmt(saldoAFavor)}</p>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="px-5 py-4 border-t border-[#E2E8F0] flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {loading && <Loader2 size={13} className="animate-spin" />}
              Registrar pago
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CarteraDetailClient({ entries, payments, unapplied, clientName, clientNit }: {
  entries: CarteraEntry[]; payments: ClientPayment[]; unapplied: UnappliedAnticipo[]; clientName: string; clientNit: string | null
}) {
  const router = useRouter()
  const [payModal, setPayModal]     = useState<CarteraEntry | null>(null)
  const [multiPay, setMultiPay]     = useState(false)
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

  if (entries.length === 0 && unapplied.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
        <p className="text-sm text-[#64748B]">No hay entradas de cartera para este cliente.</p>
      </div>
    )
  }

  const totalUnapplied = unapplied.reduce((s, a) => s + a.amount, 0)

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
      {multiPay && (
        <MultiPayModal
          entries={entries}
          clientName={clientName}
          clientNit={clientNit}
          onClose={() => setMultiPay(false)}
        />
      )}

      {entries.length > 0 && <>
      {/* Acción principal */}
      <div className="flex justify-end">
        <button
          onClick={() => setMultiPay(true)}
          disabled={unpaid.length === 0}
          className="inline-flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Wallet size={15} /> Registrar pago
        </button>
      </div>

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
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Ant. manifiesto</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Ant. recibido</th>
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
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#94A3B8]">
                      {entry.advanceManifiesto > 0 ? fmt(entry.advanceManifiesto) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#64748B]">
                      {entry.advanceReceived > 0 ? fmt(entry.advanceReceived) : '—'}
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
      </>}

      {/* Anticipos sin aplicar */}
      {unapplied.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
              Anticipos sin aplicar ({unapplied.length})
            </span>
            <span className="text-xs font-bold text-amber-800 tabular-nums">{fmt(totalUnapplied)}</span>
          </div>
          <div className="px-4 py-2 text-[11px] text-amber-700 bg-amber-50/40 border-b border-amber-100">
            Consignaciones de anticipo recibidas que aún no están cruzadas contra una factura (sin viaje asignado o cuyo viaje no tiene factura).
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Fecha</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Descripción</th>
                  <th className="text-center py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Viaje</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {unapplied.map(a => (
                  <tr key={a.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-4 text-sm text-[#64748B] whitespace-nowrap">{fmtDate(a.date)}</td>
                    <td className="py-2.5 px-4 text-sm text-[#0F172A] max-w-[280px] truncate">{a.description ?? '—'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        a.hasTrip ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {a.hasTrip ? 'Con viaje' : 'Sin viaje'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-[#0F172A]">{fmt(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de pagos */}
      {payments.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <span className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Historial de pagos ({payments.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Fecha</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Monto</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Facturas cubiertas</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Descripción</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Saldo a favor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors align-top">
                    <td className="py-2.5 px-4 text-sm text-[#64748B] whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-[#0F172A]">{fmt(Number(p.amount))}</td>
                    <td className="py-2.5 px-4 text-xs text-[#64748B]">
                      {(p.covered_invoices ?? []).length > 0
                        ? (p.covered_invoices ?? []).map(n => formatInvoiceNumber(n)).join(', ')
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#64748B] max-w-[220px] truncate">{p.description ?? '—'}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-green-700">
                      {Number(p.saldo_a_favor) > 0 ? fmt(Number(p.saldo_a_favor)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
