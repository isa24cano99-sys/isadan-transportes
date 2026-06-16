import { supabase } from '@/lib/supabase'
import NuevoViajeForm from './form'

async function getFormData() {
  const { data: clients } = await supabase.from('clients').select('id, name, nit').order('name')
const { data: vehicles } = await supabase.from('vehicles').select('id, plate, brand, model').order('plate')
const { data: drivers } = await supabase.from('drivers').select('id, full_name').order('full_name')



  return {
    clients: clients ?? [],
    vehicles: vehicles ?? [],
    drivers: drivers ?? [],
  }
}

export default async function NuevoViajePage() {
  const { clients, vehicles, drivers } = await getFormData()
  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nuevo viaje</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Registra un nuevo viaje de carga</p>
      </div>
      <NuevoViajeForm clients={clients} vehicles={vehicles} drivers={drivers} />
    </div>
  )
}