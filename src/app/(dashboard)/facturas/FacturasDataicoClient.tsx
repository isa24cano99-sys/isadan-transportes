'use client'

import { useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, FileText, Truck, ExternalLink, Minus, Upload, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { importarFacturasExcelAction } from './actions'
import { generarFacturaAction } from '../viajes/[id]/actions'
import { formatInvoiceNumber } from '@/lib/utils'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export type FacturaRow = {
  id:             string
  invoice_number: string | null
  issue_date:     string | null
  client_name:    string | null
  total_amount:   number | null
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

export default function FacturasDataicoClient({
  facturas,
  viajesSinFactura,
  defaultMes,
  defaultAnio,
}: {
  facturas: FacturaRow[]
  viajesSinFactura: ViajeSinFactura[]
  defaultMes: string
  defaultAnio: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [invoicing,  setInvoicing]  = useState<Set<string>>(new Set())
  const [invoiceErr, setInvoiceErr] = useState<Record<string, string>>({})

  // Filtro de período. El mes/año actual se calcula en el servidor (page.tsx) y
  // llega por props, así el render server/cliente coincide (sin setState en effect).
  const [mes,  setMes]  = useState(defaultMes)
  const [anio, setAnio] = useState(defaultAnio)
  const [showDetail, setShowDetail] = useState(false)

  const anios = useMemo(() => {
    const set = new Set<number>()
    for (const f of facturas) if (f.issue_date) set.add(Number(f.issue_date.slice(0, 4)))
    if (anio) set.add(Number(anio))
    return Array.from(set).sort((a, b) => b - a)
  }, [facturas, anio])

  const facturasFiltradas = useMemo(() => facturas.filter(f => {
    if (!f.issue_date) return !mes && !anio
    const [y, m] = f.issue_date.split('-')
    if (anio && y !== anio) return false
    if (mes && String(parseInt(m, 10)) !== mes) return false
    return true
  }), [facturas, mes, anio])

  const totalPeriodo = useMemo(
    () => facturasFiltradas.reduce((s, f) => s + Number(f.total_amount ?? 0), 0),
    [facturasFiltradas],
  )
  const periodoLabel = mes || anio
    ? `${mes ? MESES[parseInt(mes, 10) - 1] : 'Todos los meses'} ${anio || ''}`.trim()
    : 'Todo el histórico'

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Permitir volver a subir el mismo archivo
    e.target.value = ''
    if (!file) return

    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setImportMsg({ type: 'err', text: 'El archivo debe ser un Excel (.xlsx / .xls).' })
      return
    }

    setImporting(true)
    setImportMsg(null)
    const res = await importarFacturasExcelAction(file)
    setImporting(false)
    if (!res.ok) {
      setImportMsg({ type: 'err', text: res.error ?? 'Error al importar el Excel' })
    } else {
      setImportMsg({
        type: 'ok',
        text: `${res.procesadas} procesadas · ${res.nuevas} nuevas · ${res.actualizadas} actualizadas.`,
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
      {/* Header + import */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Ingresos Facturados</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Facturas emitidas (Dataico) · total del período seleccionado
          </p>
        </div>
        <div className="flex items-center gap-2">
          {importMsg && (
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
              importMsg.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {importMsg.text}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
          >
            <Upload size={14} className={importing ? 'animate-pulse' : ''} />
            {importing ? 'Importando…' : 'Importar Excel Dataico'}
          </button>
        </div>
      </div>

      {/* Filtro mes/año */}
      <div className="flex items-center gap-2">
        <select value={mes} onChange={e => setMes(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
          <option value="">Todos los meses</option>
          {MESES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
          <option value="">Todos los años</option>
          {anios.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      {/* Card total del período (click → ver detalle) */}
      <button
        onClick={() => setShowDetail(v => !v)}
        className="w-full text-left bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-[#2563EB]/30 hover:shadow-sm transition-all"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-[#2563EB]" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#0F172A] tabular-nums">{fmt(totalPeriodo)}</p>
              <p className="text-xs text-[#64748B] mt-0.5">
                {periodoLabel} · {facturasFiltradas.length} factura{facturasFiltradas.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]">
            {showDetail ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Ver detalle
          </span>
        </div>
      </button>

      {/* Detalle (colapsable) */}
      {showDetail && (
        facturasFiltradas.length > 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Número FEIT</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cliente</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Valor</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {facturasFiltradas.map(f => (
                    <tr key={f.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-4 font-medium text-[#0F172A] font-mono text-xs">{formatInvoiceNumber(f.invoice_number)}</td>
                      <td className="py-3 px-4 text-[#64748B]">{f.issue_date ?? '—'}</td>
                      <td className="py-3 px-4 text-[#0F172A]">{f.client_name ?? '—'}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#0F172A]">{fmt(Number(f.total_amount ?? 0))}</td>
                      <td className="py-3 px-4 text-right">
                        {f.pdf_url ? (
                          <a href={f.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline">
                            PDF <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-xs text-[#CBD5E1]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
            <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3">
              <FileText size={20} className="text-[#94A3B8]" />
            </div>
            <p className="text-sm font-medium text-[#0F172A]">No hay facturas en el período</p>
            <p className="text-xs text-[#64748B] mt-1">
              Cambia el filtro o haz clic en <strong>Importar Excel Dataico</strong> para traer el historial.
            </p>
          </div>
        )
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
