import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { LegalizacionesClient } from './LegalizacionesClient'

async function getLegalizaciones() {
  const { data } = await supabase
    .from('legalizations')
    .select(`
      id, date, advance_amount, total_expenses, balance, status,
      trips(trip_number, manifest_number, manifest_auth, origin, destination, vehicles(plate)),
      drivers(full_name)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function LegalizacionesPage() {
  const legalizaciones = await getLegalizaciones()

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Legalizaciones</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{legalizaciones.length} legalizaciones registradas</p>
        </div>
        <Link
          href="/legalizaciones/nueva"
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
        >
          <Plus size={15} />
          Nueva legalización
        </Link>
      </div>

      <LegalizacionesClient legalizaciones={legalizaciones as any} />
    </div>
  )
}
