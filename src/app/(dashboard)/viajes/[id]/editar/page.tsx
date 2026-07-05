import { supabase } from '@/lib/supabase'
import ViajeForm from '../../nuevo/form'
import { notFound } from 'next/navigation'

async function getData(id: string) {
  const [{ data: trip }, { data: clients }, { data: vehicles }, { data: drivers }] = await Promise.all([
    supabase
      .from('trips')
      .select('id, manifest_auth, manifest_number, client_id, vehicle_id, driver_id, origin, destination, load_date, freight_value, advance_amount, weight_kg, price_per_ton, load_content, notes')
      .eq('id', id)
      .single(),
    supabase.from('clients').select('id, name, nit').order('name'),
    supabase.from('vehicles').select('id, plate, brand, model').order('plate'),
    supabase.from('drivers').select('id, full_name').order('full_name'),
  ])
  return { trip, clients: clients ?? [], vehicles: vehicles ?? [], drivers: drivers ?? [] }
}

export default async function EditarViajePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { trip, clients, vehicles, drivers } = await getData(id)
  if (!trip) notFound()

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Editar viaje</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Modifica los datos del viaje</p>
      </div>
      <ViajeForm
        clients={clients}
        vehicles={vehicles}
        drivers={drivers}
        trip={trip as any}
      />
    </div>
  )
}
