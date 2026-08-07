import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import ManifiestoUpload from '../ManifiestoUpload'
import ViajesClient from './ViajesClient'

async function getTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select(`
      id, trip_number, manifest_auth, manifest_number, origin, destination, load_date,
      freight_value, advance_amount, status, notes, dataico_invoice_id,
      clients(id, name),
      terceros(id, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),
      vehicles(id, plate, brand),
      drivers(id, full_name),
      invoices(invoice_number, issue_date)
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
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Viajes</h1>
          <p className="text-xs text-[#64748B] mt-0.5">{trips.length} viajes registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <ManifiestoUpload compact />
          <Link
            href="/viajes/nuevo"
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
          >
            <Plus size={15} />
            Nuevo viaje
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 md:mb-6">
        {[
          { label: 'Total viajes',     value: totals.total,      format: 'number' },
          { label: 'En curso',         value: totals.enCurso,    format: 'number' },
          { label: 'Sin facturar',     value: totals.pendientes, format: 'number' },
          { label: 'Ingresos pagados', value: totals.ingresos,   format: 'money' },
        ].map(({ label, value, format }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4">
            <p className="text-lg md:text-xl font-bold text-[#0F172A]">
              {format === 'money' ? formatCOP(value) : value}
            </p>
            <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <ViajesClient trips={trips as any} />
    </div>
  )
}
