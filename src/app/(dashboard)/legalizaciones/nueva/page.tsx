import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevaLegalizacionForm from './form'

async function getData() {
  const [{ data: trips }, { data: cats }] = await Promise.all([
    supabase
      .from('trips')
      .select(`
        id, trip_number, origin, destination, load_date,
        freight_value, advance_amount, driver_id,
        manifest_number, weight_kg, price_per_ton,
        clients(name), vehicles(plate), drivers(full_name)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('transaction_categories')
      .select('id, name, puc_code, type, active')
      .eq('active', true)
      .eq('type', 'NEGOCIO')
      .order('name'),
  ])
  return { trips: trips ?? [], categories: cats ?? [] }
}

export default async function NuevaLegalizacionPage() {
  const { trips, categories } = await getData()

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/legalizaciones"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
          <ChevronLeft size={16} /> Legalizaciones
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">Nueva legalización</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nueva legalización</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Liquidación del conductor después del viaje</p>
      </div>
      <NuevaLegalizacionForm trips={trips as any} categories={categories as any} />
    </div>
  )
}
