import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import ClientesClient from './client'

async function getClientes() {
  const { data } = await supabase
    .from('clients')
    .select('*')
    .order('name')
  return data ?? []
}

export default async function ClientesPage() {
  const clientes = await getClientes()
  return <ClientesClient clientes={clientes} />
}
