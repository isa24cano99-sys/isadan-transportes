import { supabase } from '@/lib/supabase'
import ConductoresClient from './client'

async function getConductores() {
  const { data } = await supabase.from('drivers').select('*').order('full_name')
  return data ?? []
}

export default async function ConductoresPage() {
  const conductores = await getConductores()
  return <ConductoresClient conductores={conductores} />
}
