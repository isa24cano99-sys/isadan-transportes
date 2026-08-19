'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP, formatDate, formatInvoiceNumber } from '@/lib/utils'
import Link from 'next/link'
import {
  TruckIcon, Pencil, Eye, Search, X,
  FileText, Loader2, CheckCircle, Filter,
} from 'lucide-react'
import { generarFacturaAction } from './[id]/actions'
import { useUrlState } from '@/lib/useUrlState'
import { nombreTercero } from '@/lib/tercero-nombre'

const statusConfig: Record<string, { label: string; className: string }> = {
  PLANEADO:   { label: 'Planeado',   className: 'bg-gray-100 text-gray-600' },
  EN_CURSO:   { label: 'En curso',   className: 'bg-blue-100 text-blue-700' },
  FINALIZADO: { label: 'Finalizado', className: 'bg-green-100 text-green-700' },
  FACTURADO:  { label: 'Facturado',  className: 'bg-yellow-100 text-yellow-700' },
  PAGADO:     { label: 'Pagado',     className: 'bg-emerald-100 text-emerald-700' },
}

type InvoiceInfo = { invoice_number: string | null; issue_date: string | null }

type Trip = {
  id: string
  trip_number: string
  manifest_auth: string | null
  manifest_number: string | null
  origin: string
  destination: string
  load_date: string
  freight_value: number
  advance_amount: number
  status: string
  notes: string | null
  dataico_invoice_id: string | null
  invoices: InvoiceInfo[] | null
  clients: { id: string; name: string } | null
  terceros: {
    id: string; razon_social: string | null; primer_nombre: string | null; otros_nombres: string | null
    primer_apellido: string | null; segundo_apellido: string | null; tipo_persona: string | null
  } | null
  vehicles: { id: string; plate: string; brand: string } | null
  drivers: { id: string; full_name: string } | null
}

type Tab = 'todos' | 'por_facturar' | 'facturados'

// Nombre del cliente para mostrar/agrupar: el canónico del TERCERO (deduplicado), con
// fallback al legacy clients.name solo si por alguna razón faltara el tercero.
const nombreCliente = (t: Trip): string =>
  (t.terceros ? nombreTercero(t.terceros) : '') || t.clients?.name || ''

// Anticipo POR VIAJE (del manifiesto, trips.advance_amount). Vacío/0 → "—" (sin dato),
// para no simular un $0 real. Es distinto del anticipo del cliente (28050510), que vive
// a nivel tercero y solo se muestra en la ficha individual.
const fmtAnticipo = (v: number | null | undefined) => (v && v > 0 ? formatCOP(v) : '—')

export default function ViajesClient({ trips }: { trips: Trip[] }) {
  const router = useRouter()

  const [plateBuscar, setPlateBuscar] = useUrlState('placa')
  const [manifBuscar, setManifBuscar] = useUrlState('manif')
  const [rutaBuscar,  setRutaBuscar]  = useUrlState('ruta')
  const [desde,       setDesde]       = useUrlState('desde')
  const [hasta,       setHasta]       = useUrlState('hasta')
  const [clienteId,   setClienteId]   = useUrlState('cliente')
  const [conductorId, setConductorId] = useUrlState('conductor')
  const [estado,      setEstado]      = useUrlState('estado')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [tab,         setTab]         = useUrlState('tab', 'todos') as [Tab, (v: Tab) => void]
  const [invoicing,  setInvoicing]    = useState<Set<string>>(new Set())
  const [invoiceErr, setInvoiceErr]   = useState<Record<string, string>>({})
  const [invoiceOk,  setInvoiceOk]    = useState<Record<string, string>>({})

  const porFacturar = useMemo(
    () => trips.filter(t => t.status === 'FINALIZADO' && !t.dataico_invoice_id),
    [trips],
  )
  const facturados  = useMemo(
    () => trips.filter(t => !!t.dataico_invoice_id),
    [trips],
  )

  const baseList = tab === 'por_facturar' ? porFacturar
                 : tab === 'facturados'   ? facturados
                 : trips

  // Clientes únicos presentes en los viajes — agrupados por el TERCERO real (tercero_id),
  // no por el client_id legacy. Esto colapsa las variantes de texto (typos/puntuación) que
  // apuntan al mismo tercero en una sola opción. El filtrado (abajo) también es por tercero.
  const clientesUnicos = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trips) if (t.terceros) m.set(t.terceros.id, nombreCliente(t))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [trips])
  const conductoresUnicos = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trips) if (t.drivers) m.set(t.drivers.id, t.drivers.full_name)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [trips])

  const filtered = useMemo(() => {
    const pl = plateBuscar.trim().toLowerCase()
    const mn = manifBuscar.trim().toLowerCase()
    const rt = rutaBuscar.trim().toLowerCase()
    return baseList.filter(t => {
      if (pl && !(t.vehicles?.plate ?? '').toLowerCase().includes(pl)) return false
      if (mn) {
        const inAuth = (t.manifest_auth   ?? '').toLowerCase().includes(mn)
        const inNum  = (t.manifest_number ?? '').toLowerCase().includes(mn)
        if (!inAuth && !inNum) return false
      }
      if (rt && !`${t.origin} ${t.destination}`.toLowerCase().includes(rt)) return false
      if (desde && (t.load_date ?? '') < desde) return false
      if (hasta && (t.load_date ?? '') > hasta) return false
      if (clienteId   && t.terceros?.id !== clienteId)  return false
      if (conductorId && t.drivers?.id !== conductorId) return false
      if (estado      && t.status !== estado)           return false
      return true
    })
  }, [baseList, plateBuscar, manifBuscar, rutaBuscar, desde, hasta, clienteId, conductorId, estado])

  const activeCount = [plateBuscar, manifBuscar, rutaBuscar, desde, hasta, clienteId, conductorId, estado].filter(Boolean).length
  const hasFilters = activeCount > 0
  const clearFilters = () => {
    setPlateBuscar(''); setManifBuscar(''); setRutaBuscar(''); setDesde(''); setHasta('')
    setClienteId(''); setConductorId(''); setEstado('')
  }

  const handleFacturar = async (tripId: string) => {
    setInvoicing(s => { const n = new Set(s); n.add(tripId); return n })
    setInvoiceErr(e => { const n = { ...e }; delete n[tripId]; return n })
    const res = await generarFacturaAction(tripId)
    setInvoicing(s => { const n = new Set(s); n.delete(tripId); return n })
    if (!res.ok) {
      setInvoiceErr(e => ({ ...e, [tripId]: res.error }))
    } else {
      setInvoiceOk(o => ({ ...o, [tripId]: res.invoiceNumber }))
      setTimeout(() => router.refresh(), 1500)
    }
  }

  const TABS = [
    { id: 'todos'        as Tab, label: 'Todos',        count: trips.length        },
    { id: 'por_facturar' as Tab, label: 'Por facturar', count: porFacturar.length  },
    { id: 'facturados'   as Tab, label: 'Facturados',   count: facturados.length   },
  ]

  return (
    <>
      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              tab === t.id ? 'bg-[#F1F5F9] text-[#64748B]' : 'bg-[#E2E8F0] text-[#94A3B8]'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Filtros ── */}
      {/* Botón móvil */}
      <button onClick={() => setFiltersOpen(o => !o)}
        className="md:hidden flex items-center gap-2 w-full justify-center px-3 py-2.5 mb-3 text-sm font-medium border border-[#E2E8F0] rounded-lg bg-white text-[#374151]">
        <Filter size={15} /> Filtrar
        {activeCount > 0 && <span className="text-[10px] font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>}
      </button>

      <div className={`${filtersOpen ? 'block' : 'hidden'} md:block mb-4`}>
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-end gap-2 bg-white md:bg-transparent border md:border-0 border-[#E2E8F0] rounded-xl p-3 md:p-0">
          <div className="relative md:w-36">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input type="text" placeholder="Placa..." value={plateBuscar} onChange={e => setPlateBuscar(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          </div>
          <div className="relative md:w-44">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input type="text" placeholder="Manifiesto..." value={manifBuscar} onChange={e => setManifBuscar(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          </div>
          <div className="relative md:w-44">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input type="text" placeholder="Origen / destino..." value={rutaBuscar} onChange={e => setRutaBuscar(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-[#94A3B8] mb-0.5 ml-0.5">Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="px-2.5 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#94A3B8] mb-0.5 ml-0.5">Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="px-2.5 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
            </div>
          </div>
          <select value={clienteId} onChange={e => setClienteId(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] md:max-w-[180px]">
            <option value="">Todos los clientes</option>
            {clientesUnicos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={conductorId} onChange={e => setConductorId(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] md:max-w-[180px]">
            <option value="">Todos los conductores</option>
            {conductoresUnicos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]">
            <option value="">Todos los estados</option>
            {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs text-[#64748B] hover:text-[#0F172A] transition-colors">
              <X size={12} /> Limpiar ({activeCount})
            </button>
          )}
          <span className="text-xs text-[#94A3B8] md:ml-auto md:self-center">{filtered.length} de {baseList.length}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          TAB: POR FACTURAR
      ══════════════════════════════════════════════ */}
      {tab === 'por_facturar' && (
        <>
          <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider"># Viaje</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Ruta</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Cliente</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Vehículo</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Fecha cargue</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Flete</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-14">
                      <CheckCircle size={28} className="text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-[#0F172A]">¡Todo facturado!</p>
                      <p className="text-xs text-[#64748B] mt-0.5">No hay viajes FINALIZADO pendientes de facturación.</p>
                    </td>
                  </tr>
                ) : filtered.map(trip => {
                  const busy    = invoicing.has(trip.id)
                  const err     = invoiceErr[trip.id]
                  const success = invoiceOk[trip.id]
                  return (
                    <tr key={trip.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-xs text-[#0F172A]">{trip.origin}</p>
                        <p className="text-xs text-[#64748B]">→ {trip.destination}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] hidden lg:table-cell">{nombreCliente(trip)}</td>
                      <td className="px-3 py-2 text-xs font-mono text-[#0F172A]">{trip.vehicles?.plate}</td>
                      <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{formatDate(trip.load_date)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-right text-[#0F172A]">{formatCOP(trip.freight_value)}</td>
                      <td className="px-3 py-2 text-right">
                        {success ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-semibold">
                            <CheckCircle size={12} /> {formatInvoiceNumber(success)}
                          </span>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-1">
                            <button
                              onClick={() => handleFacturar(trip.id)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {busy
                                ? <><Loader2 size={11} className="animate-spin" /> Facturando…</>
                                : <><FileText size={11} /> Facturar</>}
                            </button>
                            {err && <p className="text-[10px] text-red-600 max-w-[200px] text-right leading-tight">{err}</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle size={28} className="text-green-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-[#0F172A]">¡Todo facturado!</p>
              </div>
            ) : filtered.map(trip => {
              const busy    = invoicing.has(trip.id)
              const err     = invoiceErr[trip.id]
              const success = invoiceOk[trip.id]
              return (
                <div key={trip.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                    <span className="text-sm font-bold text-[#0F172A]">{formatCOP(trip.freight_value)}</span>
                  </div>
                  <p className="text-sm font-medium text-[#0F172A]">{trip.origin} → {trip.destination}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {[nombreCliente(trip), trip.vehicles?.plate, formatDate(trip.load_date)].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-2.5">
                    {success ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 font-semibold">
                        <CheckCircle size={13} /> Facturada: {formatInvoiceNumber(success)}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFacturar(trip.id)}
                          disabled={busy}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {busy
                            ? <><Loader2 size={14} className="animate-spin" /> Facturando…</>
                            : <><FileText size={14} /> Facturar</>}
                        </button>
                        {err && <p className="text-xs text-red-600 mt-1 leading-tight">{err}</p>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          TAB: FACTURADOS
      ══════════════════════════════════════════════ */}
      {tab === 'facturados' && (
        <>
          <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider"># Viaje</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">N° Factura</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Ruta</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Cliente</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Flete</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Fecha factura</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-xs text-[#64748B]">
                      No hay viajes facturados aún.
                    </td>
                  </tr>
                ) : filtered.map(trip => {
                  const inv = trip.invoices?.[0] ?? null
                  return (
                    <tr key={trip.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                      </td>
                      <td className="px-3 py-2">
                        {inv?.invoice_number ? (
                          <span className="text-xs font-mono font-semibold bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {formatInvoiceNumber(inv.invoice_number)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-xs text-[#0F172A]">{trip.origin}</p>
                        <p className="text-xs text-[#64748B]">→ {trip.destination}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] hidden lg:table-cell">{nombreCliente(trip)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-right text-[#0F172A]">{formatCOP(trip.freight_value)}</td>
                      <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">
                        {inv?.issue_date ? formatDate(inv.issue_date) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/viajes/${trip.id}`}
                          className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#0F172A] font-medium">
                          <Eye size={11} /> Ver
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-[#64748B]">No hay viajes facturados aún.</div>
            ) : filtered.map(trip => {
              const inv = trip.invoices?.[0] ?? null
              return (
                <div key={trip.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                      {inv?.invoice_number && (
                        <span className="text-xs font-mono font-semibold bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                          {formatInvoiceNumber(inv.invoice_number)}
                        </span>
                      )}
                    </div>
                    <Link href={`/viajes/${trip.id}`}
                      className="text-xs text-[#2563EB] font-semibold flex-shrink-0 min-h-[36px] flex items-center">
                      Ver →
                    </Link>
                  </div>
                  <p className="text-sm font-medium text-[#0F172A]">{trip.origin} → {trip.destination}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-[#0F172A]">{formatCOP(trip.freight_value)}</span>
                    {inv?.issue_date
                      ? <span className="text-xs text-[#94A3B8]">{formatDate(inv.issue_date)}</span>
                      : nombreCliente(trip) && <span className="text-xs text-[#94A3B8] truncate max-w-[140px]">{nombreCliente(trip)}</span>
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          TAB: TODOS
      ══════════════════════════════════════════════ */}
      {tab === 'todos' && (
        <>
          <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider"># Viaje</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Manifiesto</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Ruta</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Cliente</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Vehículo</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Conductor</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Fecha</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Flete</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Anticipo</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12">
                      <TruckIcon size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                      <p className="text-xs text-[#64748B]">
                        {trips.length === 0 ? 'No hay viajes registrados' : 'Sin resultados para los filtros aplicados'}
                      </p>
                      {trips.length === 0 && (
                        <Link href="/viajes/nuevo" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                          Registrar primer viaje →
                        </Link>
                      )}
                    </td>
                  </tr>
                ) : filtered.map(trip => {
                  const st = statusConfig[trip.status] ?? { label: trip.status, className: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={trip.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        {trip.manifest_auth
                          ? <span className="text-xs font-mono text-[#0F172A]">{trip.manifest_auth}</span>
                          : <span className="text-xs text-[#CBD5E1]">—</span>}
                        {trip.manifest_number && (
                          <p className="text-[10px] text-[#94A3B8] mt-0.5">MF: {trip.manifest_number}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-xs text-[#0F172A]">{trip.origin}</p>
                        <p className="text-xs text-[#64748B]">→ {trip.destination}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] hidden lg:table-cell">{nombreCliente(trip)}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A]">{trip.vehicles?.plate}</td>
                      <td className="px-3 py-2 text-xs text-[#0F172A] hidden lg:table-cell">{trip.drivers?.full_name}</td>
                      <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{formatDate(trip.load_date)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-[#0F172A] text-right">{formatCOP(trip.freight_value)}</td>
                      <td className="px-3 py-2 text-xs text-right text-[#475569] tabular-nums">{fmtAnticipo(trip.advance_amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <Link href={`/viajes/${trip.id}`}
                            className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#0F172A] font-medium">
                            <Eye size={11} /> Ver
                          </Link>
                          <Link href={`/viajes/${trip.id}/editar`}
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium">
                            <Pencil size={11} /> Editar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <TruckIcon size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-xs text-[#64748B]">
                  {trips.length === 0 ? 'No hay viajes registrados' : 'Sin resultados'}
                </p>
                {trips.length === 0 && (
                  <Link href="/viajes/nuevo" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                    Registrar primer viaje →
                  </Link>
                )}
              </div>
            ) : filtered.map(trip => {
              const st = statusConfig[trip.status] ?? { label: trip.status, className: 'bg-gray-100 text-gray-600' }
              return (
                <div key={trip.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
                    </div>
                    <Link href={`/viajes/${trip.id}`}
                      className="text-xs text-[#2563EB] font-semibold flex-shrink-0 min-h-[36px] flex items-center">
                      Ver →
                    </Link>
                  </div>
                  <p className="text-sm font-medium text-[#0F172A]">{trip.origin} → {trip.destination}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {trip.vehicles?.plate && <span className="text-xs text-[#64748B] font-mono">{trip.vehicles.plate}</span>}
                    {trip.drivers?.full_name && <span className="text-xs text-[#64748B]">{trip.drivers.full_name}</span>}
                    {trip.manifest_number && <span className="text-xs text-[#94A3B8]">MF: {trip.manifest_number}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-[#0F172A]">{formatCOP(trip.freight_value)}</span>
                      <span className="text-[11px] text-[#94A3B8]">Ant. {fmtAnticipo(trip.advance_amount)}</span>
                    </div>
                    {nombreCliente(trip) && (
                      <span className="text-xs text-[#94A3B8] truncate max-w-[120px]">{nombreCliente(trip)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
