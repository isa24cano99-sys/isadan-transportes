import { supabase } from '@/lib/supabase'
import NuevoViajeForm from './form'
import { nombreTercero } from '@/lib/tercero-nombre'

async function getFormData() {
  const [{ data: terRaw }, { data: vehicles }, { data: drivers }] = await Promise.all([
    supabase.from('terceros')
      .select('id, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona')
      .eq('es_cliente', true).is('merged_into', null),
    supabase.from('vehicles').select('id, plate, brand, model').order('plate'),
    supabase.from('drivers').select('id, full_name').order('full_name'),
  ])
  const terceros = (terRaw ?? [])
    .map(t => ({ id: t.id, nombre: nombreTercero(t) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return {
    terceros,
    vehicles: vehicles ?? [],
    drivers: drivers ?? [],
  }
}

export default async function NuevoViajePage() {
  const { terceros, vehicles, drivers } = await getFormData()
  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nuevo viaje</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Registra un nuevo viaje de carga</p>
      </div>
      <NuevoViajeForm terceros={terceros} vehicles={vehicles} drivers={drivers} />
    </div>
  )
}