import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevaLegalizacionForm, { LegalizacionInitialData, DynExpenseInit } from '../../nueva/form'

// Maps the old static expense_type keys to human-readable names (for legacy expenses)
const LEGACY_TYPE_NAMES: Record<string, string> = {
  acpm_contado:     'ACPM',
  cargue:           'Cargue',
  descargue:        'Descargue',
  peajes:           'Peajes',
  comision_empresa: 'Comisión empresa',
  llantas:          'Llantas',
  engrase:          'Engrase',
  lavada:           'Lavada',
  parqueos:         'Parqueos',
  carrozada:        'Carrozada',
  descarrozada:     'Descarrozada',
  cambio_aceite:    'Cambio aceite',
  varada:           'Varada',
  otros:            'Otras compras',
}

async function getData(id: string) {
  const [{ data: leg }, { data: expenses }, { data: trips }, { data: cats }] = await Promise.all([
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
    supabase
      .from('transaction_categories')
      .select('id, name, puc_code, type, active')
      .eq('active', true)
      .eq('type', 'NEGOCIO')
      .order('name'),
  ])
  return { leg, expenses: expenses ?? [], trips: trips ?? [], categories: cats ?? [] }
}

export default async function EditarLegalizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { leg, expenses, trips, categories } = await getData(id)
  if (!leg) notFound()

  // Build dynExpenses from stored legalization_expenses
  let percentage = 0
  const dynExpenses: DynExpenseInit[] = []

  for (const e of expenses) {
    if (e.expense_type === 'porcentaje') {
      percentage = e.description ? Number(e.description) : 0
      continue
    }

    // Look up by puc_code first (new format), then by legacy name mapping
    const legacyName = LEGACY_TYPE_NAMES[e.expense_type]
    const cat = (categories as any[]).find(
      (c: any) =>
        c.puc_code === e.expense_type ||
        (legacyName && c.name.toLowerCase() === legacyName.toLowerCase()) ||
        c.name.toLowerCase() === e.expense_type.toLowerCase(),
    )

    dynExpenses.push({
      pucCode:      cat?.puc_code ?? e.expense_type,
      categoryName: cat?.name     ?? (legacyName ?? e.expense_type),
      description:  e.description ?? '',
      amount:       e.amount       ?? 0,
    })
  }

  const tripData = (trips as any[]).find((t: any) => t.id === leg.trip_id)
  const freight  = (tripData as any)?.freight_value ?? 0

  const initialData: LegalizacionInitialData = {
    id:          leg.id,
    trip_id:     leg.trip_id,
    trip_date:   leg.date ?? '',
    freight,
    advance:     leg.advance_amount ?? 0,
    percentage,
    dynExpenses,
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
      <NuevaLegalizacionForm trips={trips as any} initialData={initialData} categories={categories as any} />
    </div>
  )
}
