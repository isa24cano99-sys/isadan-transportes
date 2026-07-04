import { supabase } from '@/lib/supabase'
import ProveedoresClient from './ProveedoresClient'
import { type Supplier } from './actions'

async function getSuppliers() {
  const { data } = await supabase.from('suppliers').select('*').order('name')
  return (data ?? []) as Supplier[]
}

export default async function ProveedoresPage() {
  const suppliers = await getSuppliers()
  return <ProveedoresClient initial={suppliers} />
}
