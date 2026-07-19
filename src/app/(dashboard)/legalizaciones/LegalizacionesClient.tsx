'use client'

import { useState, useMemo } from 'react'
import { formatCOP, formatDate, legalizacionBalance, tripManifiesto } from '@/lib/utils'
import Link from 'next/link'
import { FileText, Search, Pencil, Trash2, Filter, X } from 'lucide-react'
import { eliminarLegalizacionAction, cambiarEstadoLegalizacionAction } from './actions'
import { ExportComprobanteButton } from './ExportComprobanteButton'

const statusConfig: Record<string, { label: string; className: string }> = {
  BORRADOR:  { label: 'Borrador',  className: 'bg-gray-100 text-gray-600' },
  PENDIENTE: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-700' },
  APROBADA:  { label: 'Aprobada',  className: 'bg-green-100 text-green-700' },
}

type Status = 'BORRADOR' | 'PENDIENTE' | 'APROBADA'
const STATUSES: Status[] = ['BORRADOR', 'PENDIENTE', 'APROBADA']

type Legalizacion = {
  id: string
  date: string | null
  advance_amount: number | null
  total_expenses: number | null
  balance: number | null
  status: Status
  trips: {
    trip_number: string
    manifest_number: string | null
    manifest_auth: string | null
    origin: string
    destination: string
    vehicles: { plate: string } | null
  } | null
  drivers: { full_name: string } | null
}

export function LegalizacionesClient({ legalizaciones: initial }: { legalizaciones: Legalizacion[] }) {
  const [legalizaciones, setLegalizaciones] = useState(initial)
  const [plateFilter,    setPlateFilter]    = useState('')
  const [manifestFilter, setManifestFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | Status>('')
  const [desde,        setDesde]        = useState('')
  const [hasta,        setHasta]        = useState('')
  const [conductor,    setConductor]    = useState('')
  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Legalizacion | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [changingStatus, setChangingStatus] = useState<string | null>(null)

  const handleCambiarEstado = async (id: string, status: Status) => {
    setChangingStatus(id)
    const res = await cambiarEstadoLegalizacionAction(id, status)
    if (res.ok) {
      setLegalizaciones(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    }
    setChangingStatus(null)
  }

  // Conductores únicos presentes en las legalizaciones
  const conductoresUnicos = useMemo(() => {
    const s = new Set<string>()
    for (const l of legalizaciones) if (l.drivers?.full_name) s.add(l.drivers.full_name)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [legalizaciones])

  const filtered = useMemo(() => {
    return legalizaciones.filter(leg => {
      if (plateFilter) {
        const p = leg.trips?.vehicles?.plate ?? ''
        if (!p.toLowerCase().includes(plateFilter.toLowerCase())) return false
      }
      if (manifestFilter) {
        const q = manifestFilter.toLowerCase()
        const num  = (leg.trips?.manifest_number ?? '').toLowerCase()
        const auth = (leg.trips?.manifest_auth   ?? '').toLowerCase()
        if (!num.includes(q) && !auth.includes(q)) return false
      }
      if (statusFilter && leg.status !== statusFilter) return false
      if (desde && (leg.date ?? '') < desde) return false
      if (hasta && (leg.date ?? '') > hasta) return false
      if (conductor && (leg.drivers?.full_name ?? '') !== conductor) return false
      return true
    })
  }, [legalizaciones, plateFilter, manifestFilter, statusFilter, desde, hasta, conductor])

  const activeCount = [plateFilter, manifestFilter, statusFilter, desde, hasta, conductor].filter(Boolean).length
  const hasFilters = activeCount > 0
  const clearFilters = () => {
    setPlateFilter(''); setManifestFilter(''); setStatusFilter(''); setDesde(''); setHasta(''); setConductor('')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await eliminarLegalizacionAction(deleteTarget.id)
    if (res.ok) {
      setLegalizaciones(prev => prev.filter(l => l.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
    setDeleting(false)
  }

  return (
    <div>
      {/* Filtros */}
      <button onClick={() => setFiltersOpen(o => !o)}
        className="md:hidden flex items-center gap-2 w-full justify-center px-3 py-2.5 mb-3 text-sm font-medium border border-[#E2E8F0] rounded-lg bg-white text-[#374151]">
        <Filter size={15} /> Filtrar
        {activeCount > 0 && <span className="text-[10px] font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>}
      </button>

      <div className={`${filtersOpen ? 'block' : 'hidden'} md:block mb-4`}>
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-end gap-2 bg-white md:bg-transparent border md:border-0 border-[#E2E8F0] rounded-xl p-3 md:p-0">
          <div className="relative md:w-44">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input type="text" placeholder="Placa..." value={plateFilter} onChange={e => setPlateFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          </div>
          <div className="relative md:w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input type="text" placeholder="Manifiesto..." value={manifestFilter} onChange={e => setManifestFilter(e.target.value)}
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
          <select value={conductor} onChange={e => setConductor(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] md:max-w-[180px]">
            <option value="">Todos los conductores</option>
            {conductoresUnicos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | Status)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]">
            <option value="">Todos los estados</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusConfig[s]?.label ?? s}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs text-[#64748B] hover:text-[#0F172A] transition-colors">
              <X size={12} /> Limpiar ({activeCount})
            </button>
          )}
          <span className="text-xs text-[#94A3B8] md:ml-auto md:self-center">{filtered.length} de {legalizaciones.length}</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider"># Viaje</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Placa</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Conductor</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Fecha</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Anticipo</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Total gastos</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Saldo</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <FileText size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-xs text-[#64748B]">
                    {legalizaciones.length === 0 ? 'No hay legalizaciones registradas' : 'Sin resultados para los filtros aplicados'}
                  </p>
                  {legalizaciones.length === 0 && (
                    <Link href="/legalizaciones/nueva" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                      Crear primera legalizacion
                    </Link>
                  )}
                </td>
              </tr>
            ) : filtered.map(leg => {
              const st = statusConfig[leg.status] ?? { label: leg.status, className: 'bg-gray-100 text-gray-600' }
              const bal = legalizacionBalance(leg.balance ?? 0)
              const trip = leg.trips
              const vehiclePlate = trip?.vehicles?.plate ?? '—'
              const driverName   = leg.drivers?.full_name ?? '—'
              return (
                <tr key={leg.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-3 py-2">
                    <span className="text-xs font-mono font-bold text-[#2563EB]">{tripManifiesto(trip)}</span>
                    {trip && <p className="text-xs text-[#64748B] mt-0.5">{trip.origin} → {trip.destination}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[#0F172A]">{vehiclePlate}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A]">{driverName}</td>
                  <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{leg.date ? formatDate(leg.date) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A] text-right hidden lg:table-cell">{formatCOP(leg.advance_amount ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(leg.total_expenses ?? 0)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs font-bold ${bal.colorClass}`}>
                      {formatCOP(Math.abs(leg.balance ?? 0))}
                    </span>
                    <p className={`text-[10px] mt-0.5 ${bal.colorClass}`}>{bal.shortLabel}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-1 rounded-full w-fit ${st.className}`}>{st.label}</span>
                      <select
                        value={leg.status}
                        onChange={e => handleCambiarEstado(leg.id, e.target.value as Status)}
                        disabled={changingStatus === leg.id}
                        className="text-[10px] border border-[#E2E8F0] rounded px-1 py-0.5 bg-white text-[#64748B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30 disabled:opacity-40"
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{statusConfig[s]?.label ?? s}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/legalizaciones/${leg.id}`}
                        className="text-xs text-[#64748B] hover:text-[#0F172A] transition-colors font-medium px-1">
                        Ver
                      </Link>
                      <Link href={`/legalizaciones/${leg.id}/editar`}
                        className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium">
                        <Pencil size={11} /> Editar
                      </Link>
                      <ExportComprobanteButton legId={leg.id} compact />
                      <button onClick={() => setDeleteTarget(leg)}
                        className="text-[#94A3B8] hover:text-red-500 transition-colors p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={32} className="text-[#CBD5E1] mx-auto mb-3" />
            <p className="text-xs text-[#64748B]">
              {legalizaciones.length === 0 ? 'No hay legalizaciones registradas' : 'Sin resultados'}
            </p>
            {legalizaciones.length === 0 && (
              <Link href="/legalizaciones/nueva" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                Crear primera legalizacion
              </Link>
            )}
          </div>
        ) : filtered.map(leg => {
          const st = statusConfig[leg.status] ?? { label: leg.status, className: 'bg-gray-100 text-gray-600' }
          const bal = legalizacionBalance(leg.balance ?? 0)
          const trip = leg.trips
          return (
            <div key={leg.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-xs font-mono font-bold text-[#2563EB]">{tripManifiesto(trip)}</span>
                  {trip && <p className="text-xs text-[#64748B] mt-0.5">{trip.origin} → {trip.destination}</p>}
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.className}`}>{st.label}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#64748B] mb-2">
                {trip?.vehicles?.plate && <span className="font-mono">{trip.vehicles.plate}</span>}
                {leg.drivers?.full_name && <span>{leg.drivers.full_name}</span>}
                {leg.date && <span>{formatDate(leg.date)}</span>}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-sm font-bold ${bal.colorClass}`}>
                    {formatCOP(Math.abs(leg.balance ?? 0))}
                  </span>
                  <span className={`text-[10px] ml-1 ${bal.colorClass}`}>{bal.shortLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={leg.status}
                    onChange={e => handleCambiarEstado(leg.id, e.target.value as Status)}
                    disabled={changingStatus === leg.id}
                    className="text-[10px] border border-[#E2E8F0] rounded px-1 py-1 bg-white text-[#64748B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30 disabled:opacity-40"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{statusConfig[s]?.label ?? s}</option>)}
                  </select>
                  <Link href={`/legalizaciones/${leg.id}`}
                    className="text-xs text-[#64748B] font-medium min-h-[36px] flex items-center px-1">Ver</Link>
                  <Link href={`/legalizaciones/${leg.id}/editar`}
                    className="text-xs text-[#2563EB] font-medium min-h-[36px] flex items-center px-1">Editar</Link>
                  <ExportComprobanteButton legId={leg.id} compact />
                  <button onClick={() => setDeleteTarget(leg)}
                    className="text-[#94A3B8] hover:text-red-500 min-h-[36px] px-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar legalizacion</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara la legalizacion del viaje{' '}
              <span className="font-medium text-[#0F172A]">{tripManifiesto(deleteTarget.trips)}</span>{' '}
              junto con todos sus gastos. Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
