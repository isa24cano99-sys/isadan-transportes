import { supabase } from '@/lib/supabase'
import VehiculosClient from './client'

async function getVehiculos() {
  const { data } = await supabase.from('vehicles').select('*').order('plate')
  return data ?? []
}

export default async function VehiculosPage() {
  const vehiculos = await getVehiculos()
  return <VehiculosClient vehiculos={vehiculos} />
}
