import { supabase } from '@/lib/supabase'
import { formatCOP, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, TruckIcon, Pencil, Eye } from 'lucide-react'
import ManifiestoUpload from '../ManifiestoUpload'

const statusConfig: Record<string, { label: string; className: string }> = {
  PLANEADO:   { label: 'Planeado',   className: 'bg-gray-100 text-gray-600' },
  EN_CURSO:   { label: 'En curso',   className: 'bg-blue-100 text-blue-700' },
  FINALIZADO: { label: 'Finalizado', className: 'bg-green-100 text-green-700' },
  FACTURADO:  { label: 'Facturado',  className: 'bg-yellow-100 text-yellow-700' },
  PAGADO:     { label: 'Pagado',     className: 'bg-emerald-100 text-emerald-700' },
}

async function getTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select(`
      id, trip_number, manifest_auth, manifest_number, origin, destination, load_date,
      freight_value, advance_amount, status, notes,
      clients(id, name),
      vehicles(id, plate, brand),
      drivers(id, full_name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
  console.error('ERROR VIAJES:', JSON.stringify(error))
  return []
}
return data ?? []
}

export default async function ViajesPage() {
  const trips = await getTrips()

  const totals = {
    total: trips.length,
    enCurso: trips.filter(t => t.status === 'EN_CURSO').length,
    pendientes: trips.filter(t => ['PLANEADO', 'EN_CURSO', 'FINALIZADO'].includes(t.status)).length,
    ingresos: trips.filter(t => t.status === 'PAGADO').reduce((s, t) => s + Number(t.freight_value), 0),
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Viajes</h1>
          <p className="text-xs text-[#64748B] mt-0.5">{trips.length} viajes registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <ManifiestoUpload compact />
          <Link
            href="/viajes/nuevo"
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} />
            Nuevo viaje
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total viajes',    value: totals.total,      format: 'number' },
          { label: 'En curso',        value: totals.enCurso,    format: 'number' },
          { label: 'Sin facturar',    value: totals.pendientes, format: 'number' },
          { label: 'Ingresos pagados',value: totals.ingresos,   format: 'money' },
        ].map(({ label, value, format }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <p className="text-xl font-bold text-[#0F172A]">
              {format === 'money' ? formatCOP(value) : value}
            </p>
            <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider"># Viaje</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Manifiesto</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Ruta</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Cliente</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Vehículo</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Conductor</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha expedición</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Flete</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {trips.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <TruckIcon size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-xs text-[#64748B]">No hay viajes registrados</p>
                  <Link href="/viajes/nuevo" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
                    Registrar primer viaje →
                  </Link>
                </td>
              </tr>
            ) : (
              trips.map((trip: any) => {
                const st = statusConfig[trip.status] ?? { label: trip.status, className: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={trip.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-3 py-2">
                      <span className="text-xs font-mono font-bold text-[#2563EB]">{trip.trip_number}</span>
                    </td>
                    <td className="px-3 py-2">
                      {(trip as any).manifest_auth ? (
                        <span className="text-xs font-mono text-[#0F172A]">{(trip as any).manifest_auth}</span>
                      ) : (
                        <span className="text-xs text-[#CBD5E1]">—</span>
                      )}
                      {trip.manifest_number && (
                        <p className="text-[10px] text-[#94A3B8] mt-0.5">MF: {trip.manifest_number}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-[#0F172A]">{trip.origin}</p>
                      <p className="text-xs text-[#64748B]">→ {trip.destination}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-[#0F172A]">{trip.clients?.name}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A]">{trip.vehicles?.plate}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A]">{trip.drivers?.full_name}</td>
                    <td className="px-3 py-2 text-xs text-[#64748B]">{formatDate(trip.load_date)}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-[#0F172A] text-right">{formatCOP(trip.freight_value)}</td>
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
