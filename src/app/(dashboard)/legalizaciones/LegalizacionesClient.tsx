'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileText, Search, Pencil, Trash2 } from 'lucide-react'
import { eliminarLegalizacionAction, cambiarEstadoLegalizacionAction } from './actions'
import { ExportComprobanteButton } from './ExportComprobanteButton'

const statusConfig: Record<string, { label: string; className: string }> = {
  BORRADOR:  { label: 'Borrador',  className: 'bg-gray-100 text-gray-600' },
  PENDIENTE: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-700' },
  APROBADA:  { label: 'Aprobada',  className: 'bg-green-100 text-green-700' },
}

type Status = 'BORRADOR' | 'PENDIENTE' | 'APROBADA'

type Legalizacion = {
  id: string
  date: string | null
  advance_amount: number | null
  total_expenses: number | null
  balance: number | null
  status: Status
  trips: {
    trip_number: string
    origin: string
    destination: string
    vehicles: { plate: string } | null
  } | null
  drivers: { full_name: string } | null
}

export function LegalizacionesClient({ legalizaciones: initial }: { legalizaciones: Legalizacion[] }) {
  const router = useRouter()
  const [legalizaciones, setLegalizaciones] = useState(initial)
  const [plateFilter,  setPlateFilter]  = useState('')
  const [monthFilter,  setMonthFilter]  = useState('')
  const [yearFilter,   setYearFilter]   = useState('')
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

  const filtered = useMemo(() => {
    return legalizaciones.filter(leg => {
      if (plateFilter) {
        const p = leg.trips?.vehicles?.plate ?? ''
        if (!p.toLowerCase().includes(plateFilter.toLowerCase())) return false
      }
      if (monthFilter && leg.date) {
        const legMonth = parseInt(leg.date.slice(5, 7), 10)
        if (legMonth !== parseInt(monthFilter, 10)) return false
      }
      if (yearFilter && leg.date) {
        const legYear = parseInt(leg.date.slice(0, 4), 10)
        if (legYear !== parseInt(yearFilter, 10)) return false
      }
      return true
    })
  }, [legalizaciones, plateFilter, monthFilter, yearFilter])

  const hasFilters = plateFilter || monthFilter || yearFilter

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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
        <div className="relative w-full sm:w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Buscar por placa..."
            value={plateFilter}
            onChange={e => setPlateFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
          />
        </div>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="flex-1 sm:flex-none px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
          <option value="">Todos los meses</option>
          {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
            <option key={i+1} value={String(i+1)}>{m}</option>
          ))}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="flex-1 sm:flex-none px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
          <option value="">Todos los años</option>
          {[2025, 2026, 2027].map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        {hasFilters && (
          <button onClick={() => { setPlateFilter(''); setMonthFilter(''); setYearFilter('') }}
            className="px-3 py-2 text-xs text-[#64748B] hover:text-[#0F172A] transition-colors">
            Limpiar
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-[#94A3B8]">{filtered.length} de {legalizaciones.length}</span>
        )}
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
              const trip = leg.trips
              const vehiclePlate = trip?.vehicles?.plate ?? '—'
              const driverName   = leg.drivers?.full_name ?? '—'
              return (
                <tr key={leg.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-3 py-2">
                    <span className="text-xs font-mono font-bold text-[#2563EB]">{trip?.trip_number ?? '—'}</span>
                    {trip && <p className="text-xs text-[#64748B] mt-0.5">{trip.origin} → {trip.destination}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[#0F172A]">{vehiclePlate}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A]">{driverName}</td>
                  <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{leg.date ? formatDate(leg.date) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A] text-right hidden lg:table-cell">{formatCOP(leg.advance_amount ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(leg.total_expenses ?? 0)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs font-bold ${(leg.balance ?? 0) > 0 ? 'text-red-600' : (leg.balance ?? 0) < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                      {formatCOP(Math.abs(leg.balance ?? 0))}
                    </span>
                    <p className={`text-[10px] mt-0.5 ${(leg.balance ?? 0) > 0 ? 'text-red-600' : (leg.balance ?? 0) < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                      {(leg.balance ?? 0) > 0 ? 'cond. debe' : (leg.balance ?? 0) < 0 ? 'emp. debe' : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-1 rounded-full w-fit ${st.className}`}>{st.label}</span>
                      {leg.status === 'BORRADOR' && (
                        <button onClick={() => handleCambiarEstado(leg.id, 'PENDIENTE')} disabled={changingStatus === leg.id}
                          className="text-[10px] font-semibold text-yellow-700 hover:text-yellow-900 disabled:opacity-40 text-left leading-none">
                          {changingStatus === leg.id ? '...' : '→ Pendiente'}
                        </button>
                      )}
                      {leg.status === 'PENDIENTE' && (
                        <button onClick={() => handleCambiarEstado(leg.id, 'APROBADA')} disabled={changingStatus === leg.id}
                          className="text-[10px] font-semibold text-green-700 hover:text-green-900 disabled:opacity-40 text-left leading-none">
                          {changingStatus === leg.id ? '...' : '→ Aprobar'}
                        </button>
                      )}
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
          const trip = leg.trips
          return (
            <div key={leg.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-xs font-mono font-bold text-[#2563EB]">{trip?.trip_number ?? '—'}</span>
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
                  <span className={`text-sm font-bold ${(leg.balance ?? 0) > 0 ? 'text-red-600' : (leg.balance ?? 0) < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                    {formatCOP(Math.abs(leg.balance ?? 0))}
                  </span>
                  <span className={`text-[10px] ml-1 ${(leg.balance ?? 0) > 0 ? 'text-red-600' : (leg.balance ?? 0) < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                    {(leg.balance ?? 0) > 0 ? 'cond. debe' : (leg.balance ?? 0) < 0 ? 'emp. debe' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {leg.status === 'BORRADOR' && (
                    <button onClick={() => handleCambiarEstado(leg.id, 'PENDIENTE')} disabled={changingStatus === leg.id}
                      className="text-[10px] font-semibold text-yellow-700 min-h-[36px] px-1">
                      {changingStatus === leg.id ? '...' : '→ Pendiente'}
                    </button>
                  )}
                  {leg.status === 'PENDIENTE' && (
                    <button onClick={() => handleCambiarEstado(leg.id, 'APROBADA')} disabled={changingStatus === leg.id}
                      className="text-[10px] font-semibold text-green-700 min-h-[36px] px-1">
                      {changingStatus === leg.id ? '...' : '→ Aprobar'}
                    </button>
                  )}
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
              <span className="font-medium text-[#0F172A]">{deleteTarget.trips?.trip_number ?? '—'}</span>{' '}
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
