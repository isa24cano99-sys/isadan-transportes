'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, FileText, Truck, ExternalLink, Minus } from 'lucide-react'
import { sincronizarFacturasDataicoAction } from './actions'
import { generarFacturaAction } from '../viajes/[id]/actions'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

export type FacturaRow = {
  id:             string
  invoice_number: string | null
  issue_date:     string | null
  client_name:    string | null
  total_amount:   number | null
  dian_status:    string | null
  pdf_url:        string | null
}

export type ViajeSinFactura = {
  id:           string
  trip_number:  string | null
  origin:       string | null
  destination:  string | null
  load_date:    string | null
  freight_value: number | null
  client_name:  string | null
}

/** Badge de color según estado DIAN. */
function dianBadge(status: string | null): { label: string; cls: string } {
  const s = (status ?? '').toUpperCase()
  if (s === 'ACEPTADA')  return { label: 'Aceptada',  cls: 'bg-green-100 text-green-800' }
  if (s === 'BORRADOR')  return { label: 'Borrador',  cls: 'bg-gray-100 text-gray-700' }
  if (s === 'PENDIENTE') return { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' }
  if (s === 'RECHAZADA') return { label: 'Rechazada', cls: 'bg-red-100 text-red-800' }
  if (!s)                return { label: '—',         cls: 'bg-gray-100 text-gray-500' }
  return { label: status as string, cls: 'bg-blue-100 text-blue-800' }
}

export default function FacturasDataicoClient({
  facturas,
  viajesSinFactura,
}: {
  facturas: FacturaRow[]
  viajesSinFactura: ViajeSinFactura[]
}) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [invoicing,  setInvoicing]  = useState<Set<string>>(new Set())
  const [invoiceErr, setInvoiceErr] = useState<Record<string, string>>({})

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    const res = await sincronizarFacturasDataicoAction()
    setSyncing(false)
    if (!res.ok) {
      setSyncMsg({ type: 'err', text: res.error ?? 'Error al sincronizar' })
    } else {
      setSyncMsg({
        type: 'ok',
        text: res.synced > 0
          ? `${res.synced} factura${res.synced !== 1 ? 's' : ''} sincronizada${res.synced !== 1 ? 's' : ''}.`
          : res.message ?? 'Sin cambios.',
      })
      setTimeout(() => router.refresh(), 800)
    }
  }

  const handleFacturar = async (tripId: string) => {
    setInvoicing(s => { const n = new Set(s); n.add(tripId); return n })
    setInvoiceErr(e => { const n = { ...e }; delete n[tripId]; return n })
    const res = await generarFacturaAction(tripId)
    setInvoicing(s => { const n = new Set(s); n.delete(tripId); return n })
    if (!res.ok) {
      setInvoiceErr(e => ({ ...e, [tripId]: res.error }))
    } else {
      setTimeout(() => router.refresh(), 1200)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header + sync */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Facturas electrónicas (Dataico)</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            {facturas.length} factura{facturas.length !== 1 ? 's' : ''} emitida{facturas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
              syncMsg.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {syncMsg.text}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando…' : 'Sincronizar con Dataico'}
          </button>
        </div>
      </div>

      {/* Invoices table */}
      {facturas.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Número FEIT</th>
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cliente</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Valor</th>
                  <th className="text-center py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Estado DIAN</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {facturas.map(f => {
                  const badge = dianBadge(f.dian_status)
                  return (
                    <tr key={f.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-4 font-medium text-[#0F172A] font-mono text-xs">{f.invoice_number ?? '—'}</td>
                      <td className="py-3 px-4 text-[#64748B]">{f.issue_date ?? '—'}</td>
                      <td className="py-3 px-4 text-[#0F172A]">{f.client_name ?? '—'}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#0F172A]">{fmt(Number(f.total_amount ?? 0))}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {f.pdf_url ? (
                          <a
                            href={f.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                          >
                            PDF <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-xs text-[#CBD5E1]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText size={20} className="text-[#94A3B8]" />
          </div>
          <p className="text-sm font-medium text-[#0F172A]">No hay facturas emitidas</p>
          <p className="text-xs text-[#64748B] mt-1">
            Haz clic en <strong>Sincronizar con Dataico</strong> para traer las facturas.
          </p>
        </div>
      )}

      {/* Unbilled trips */}
      {viajesSinFactura.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Truck size={15} className="text-[#64748B]" />
            <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide">
              Viajes por facturar ({viajesSinFactura.length})
            </h2>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Viaje</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Ruta</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cliente</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Flete</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {viajesSinFactura.map(v => {
                    const busy = invoicing.has(v.id)
                    const err  = invoiceErr[v.id]
                    return (
                      <tr key={v.id} className="hover:bg-[#F8FAFC] transition-colors align-top">
                        <td className="py-3 px-4 font-medium text-[#0F172A]">{v.trip_number ?? '—'}</td>
                        <td className="py-3 px-4 text-[#64748B]">{v.load_date ?? '—'}</td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {v.origin ?? '—'} → {v.destination ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-[#0F172A]">{v.client_name ?? '—'}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-[#0F172A]">{fmt(Number(v.freight_value ?? 0))}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleFacturar(v.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                          >
                            {busy && <RefreshCw size={12} className="animate-spin" />}
                            {busy ? 'Facturando…' : 'Facturar'}
                          </button>
                          {err && <p className="text-xs text-red-600 mt-1 max-w-[220px] text-right">{err}</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viajesSinFactura.length === 0 && facturas.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#94A3B8] px-1">
          <Minus size={12} /> No hay viajes finalizados pendientes de facturación.
        </div>
      )}
    </div>
  )
}
