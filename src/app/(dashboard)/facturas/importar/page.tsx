import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import ImportarClient from './ImportarClient'

async function getTrips() {
  const { data } = await supabase
    .from('trips')
    .select('id, trip_number, origin, destination, vehicles(plate)')
    .order('created_at', { ascending: false })

  return (data ?? []).map((t: any) => ({
    id:          t.id as string,
    trip_number: t.trip_number as string,
    origin:      t.origin as string,
    destination: t.destination as string,
    plate:       (t.vehicles as any)?.plate ?? null,
  }))
}

export default async function ImportarPage() {
  const trips = await getTrips()

  return (
    <div>
      <div className="px-6 pt-6 flex items-center gap-3 mb-2">
        <Link
          href="/facturas"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ChevronLeft size={16} /> Facturación DIAN
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">Importar archivos</span>
      </div>
      <ImportarClient trips={trips} />
    </div>
  )
}
