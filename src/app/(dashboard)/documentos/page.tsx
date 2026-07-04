import { supabase } from '@/lib/supabase'
import { DocumentosClient, type DocumentRow } from './DocumentosClient'

async function getData() {
  const [docsRes, vehiclesRes, driversRes] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .order('expiration_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('vehicles')
      .select('id, plate')
      .order('plate'),
    supabase
      .from('drivers')
      .select('id, full_name')
      .order('full_name'),
  ])

  return {
    docs:     docsRes.data    ?? [],
    vehicles: vehiclesRes.data ?? [],
    drivers:  driversRes.data  ?? [],
  }
}

function getDaysLeft(expirationDate: string | null): number | undefined {
  if (!expirationDate) return undefined
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expirationDate + 'T00:00:00')
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000)
}

export default async function DocumentosPage() {
  const { docs, vehicles, drivers } = await getData()

  const vehicleMap = new Map(vehicles.map(v => [v.id, v.plate]))
  const driverMap  = new Map(drivers.map(d => [d.id, d.full_name]))

  const documents: DocumentRow[] = docs.map((doc: any) => {
    // Entity display name
    let entityName: string | undefined
    if (doc.entity_type === 'VEHICULO')  entityName = vehicleMap.get(doc.entity_id) ?? doc.entity_id ?? undefined
    if (doc.entity_type === 'CONDUCTOR') entityName = driverMap.get(doc.entity_id)  ?? doc.entity_id ?? undefined
    if (doc.entity_type === 'EMPRESA')   entityName = 'ISADAN Transportes SAS'

    return {
      ...doc,
      entityName,
      daysLeft: getDaysLeft(doc.expiration_date),
    }
  })

  return (
    <div className="p-6 space-y-6">
      <DocumentosClient
        vehicles={vehicles}
        drivers={drivers}
        documents={documents}
      />
    </div>
  )
}
