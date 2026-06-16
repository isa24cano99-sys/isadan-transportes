'use client'

import { useState, useMemo } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileText, Search } from 'lucide-react'

const statusConfig: Record<string, { label: string; className: string }> = {
  BORRADOR:  { label: 'Borrador',  className: 'bg-gray-100 text-gray-600' },
  PENDIENTE: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-700' },
  APROBADA:  { label: 'Aprobada',  className: 'bg-green-100 text-green-700' },
}

type Legalizacion = {
  id: string
  date: string | null
  advance_amount: number | null
  total_expenses: number | null
  balance: number | null
  status: string
  trips: {
    trip_number: string
    origin: string
    destination: string
    vehicles: { plate: string } | null
  } | null
  drivers: { full_name: string } | null
}

export function LegalizacionesClient({ legalizaciones }: { legalizaciones: Legalizacion[] }) {
  const [plateFilter, setPlateFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return legalizaciones.filter(leg => {
      if (plateFilter) {
        const p = leg.trips?.vehicles?.plate ?? ''
        if (!p.toLowerCase().includes(plateFilter.toLowerCase())) return false
      }
      if (dateFrom && leg.date && leg.date < dateFrom) return false
      if (dateTo   && leg.date && leg.date > dateTo)   return false
      return true
    })
  }, [legalizaciones, plateFilter, dateFrom, dateTo])

  const hasFilters = plateFilter || dateFrom || dateTo

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Buscar por placa..."
            value={plateFilter}
            onChange={e => setPlateFilter(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] w-44"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]"
        />
        <span className="text-xs text-[#94A3B8]">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]"
        />
        {hasFilters && (
          <button
            onClick={() => { setPlateFilter(''); setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-[#94A3B8]">{filtered.length} de {legalizaciones.length}</span>
        )}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]"># Viaje</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Placa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Conductor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Fecha</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Anticipo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Total gastos</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Saldo conductor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <FileText size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#64748B]">
                    {legalizaciones.length === 0
                      ? 'No hay legalizaciones registradas'
                      : 'Sin resultados para los filtros aplicados'}
                  </p>
                  {legalizaciones.length === 0 && (
                    <Link href="/legalizaciones/nueva" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                      Crear primera legalización →
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(leg => {
                const st = statusConfig[leg.status] ?? { label: leg.status, className: 'bg-gray-100 text-gray-600' }
                const trip = leg.trips
                const vehiclePlate = trip?.vehicles?.plate ?? '—'
                const driverName   = leg.drivers?.full_name ?? '—'
                return (
                  <tr key={leg.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-bold text-[#2563EB]">{trip?.trip_number ?? '—'}</span>
                      {trip && (
                        <p className="text-xs text-[#64748B] mt-0.5">{trip.origin} → {trip.destination}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-[#0F172A]">{vehiclePlate}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A]">{driverName}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{leg.date ? formatDate(leg.date) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(leg.advance_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(leg.total_expenses ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${(leg.balance ?? 0) > 0 ? 'text-green-700' : (leg.balance ?? 0) < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                        {(leg.balance ?? 0) < 0 ? '-' : ''}{formatCOP(Math.abs(leg.balance ?? 0))}
                      </span>
                      <p className={`text-[10px] mt-0.5 ${(leg.balance ?? 0) > 0 ? 'text-green-700' : (leg.balance ?? 0) < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                        {(leg.balance ?? 0) > 0 ? 'emp. debe' : (leg.balance ?? 0) < 0 ? 'cond. debe' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
