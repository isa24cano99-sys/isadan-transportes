import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevaLegalizacionForm, { LegalizacionInitialData } from '../../nueva/form'

async function getData(id: string) {
  const [{ data: leg }, { data: expenses }, { data: trips }] = await Promise.all([
    supabase
      .from('legalizations')
      .select('id, trip_id, date, advance_amount, total_expenses, status, driver_id, trips(freight_value)')
      .eq('id', id)
      .single(),
    supabase
      .from('legalization_expenses')
      .select('expense_type, amount, description')
      .eq('legalization_id', id),
    supabase
      .from('trips')
      .select('id, trip_number, origin, destination, load_date, freight_value, advance_amount, driver_id, manifest_number, weight_kg, price_per_ton, clients(name), vehicles(plate), drivers(full_name)')
      .order('created_at', { ascending: false }),
  ])
  return { leg, expenses: expenses ?? [], trips: trips ?? [] }
}

export default async function EditarLegalizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { leg, expenses, trips } = await getData(id)
  if (!leg) notFound()

  const expensesMap: Record<string, string> = {}
  let otrosDesc = ''
  let percentage = 0
  for (const e of expenses) {
    if (e.expense_type === 'porcentaje') {
      // description stores the raw % value saved at creation time
      percentage = e.description ? Number(e.description) : 0
      continue
    }
    expensesMap[e.expense_type] = String(e.amount)
    if (e.expense_type === 'otros' && e.description) otrosDesc = e.description
  }

  const tripData = trips.find((t: any) => t.id === leg.trip_id)
  const freight  = (tripData as any)?.freight_value ?? 0

  const initialData: LegalizacionInitialData = {
    id:         leg.id,
    trip_id:    leg.trip_id,
    trip_date:  leg.date ?? '',
    freight,
    advance:    leg.advance_amount ?? 0,
    percentage,
    expenses:   expensesMap,
    otrosDesc,
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/legalizaciones"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
          <ChevronLeft size={16} /> Legalizaciones
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">Editar legalización</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Editar legalización</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Modifica los datos de la legalización</p>
      </div>
      <NuevaLegalizacionForm trips={trips as any} initialData={initialData} />
    </div>
  )
}
