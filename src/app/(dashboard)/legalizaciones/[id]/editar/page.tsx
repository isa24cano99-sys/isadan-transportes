import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevaLegalizacionForm, { LegalizacionInitialData, DynExpenseInit } from '../../nueva/form'
import { FIXED_FIELDS } from '@/lib/legalizacion-fields'
import { getCombustibleFE } from '@/lib/fuel-invoices'

const FIXED_KEYS = new Set(FIXED_FIELDS.map(f => f.key))
// Mapa PUC → clave fija (para datos legacy guardados por código PUC). El primer match gana.
const PUC_TO_FIXED: Record<string, string> = {}
for (const f of FIXED_FIELDS) if (!(f.puc in PUC_TO_FIXED)) PUC_TO_FIXED[f.puc] = f.key

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
  const [{ data: leg }, { data: expenses }, { data: trips }, { data: cats }, combustibleFE] = await Promise.all([
    supabase
      .from('legalizations')
      .select('id, trip_id, date, advance_amount, total_expenses, status, driver_id, trips(freight_value)')
      .eq('id', id)
      .single(),
    supabase
      .from('legalization_expenses')
      .select('expense_type, amount, description, matched_invoice_id')
      .eq('legalization_id', id),
    supabase
      .from('trips')
      .select('id, trip_number, origin, destination, load_date, freight_value, advance_amount, driver_id, manifest_number, manifest_auth, weight_kg, price_per_ton, clients(name), vehicles(plate), drivers(full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('transaction_categories')
      .select('id, name, puc_code, type, active')
      .eq('active', true)
      .eq('type', 'NEGOCIO')
      .order('name'),
    getCombustibleFE(),
  ])
  return { leg, expenses: expenses ?? [], trips: trips ?? [], categories: cats ?? [], combustibleFE }
}

export default async function EditarLegalizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { leg, expenses, trips, categories, combustibleFE } = await getData(id)
  if (!leg) notFound()

  // FE enlazada a la línea de ACPM (para precargar el dropdown al editar)
  const acpmMatchedInvoiceId =
    (expenses.find((e: any) => e.expense_type === 'acpm_contado') as any)?.matched_invoice_id ?? null

  // Reconstruir gastos fijos + adicionales desde legalization_expenses
  let percentage = 0
  let comision = 0
  const fixedExpenses: Record<string, number> = {}
  const dynExpenses: DynExpenseInit[] = []

  for (const e of expenses) {
    if (e.expense_type === 'porcentaje') {
      percentage = e.description ? Number(e.description) : 0
      continue
    }
    if (e.expense_type === 'comision_empresa') {
      comision = e.amount ?? 0
      continue
    }

    const amt = e.amount ?? 0

    // Campo fijo por clave directa, o por PUC (datos legacy guardados por código).
    if (FIXED_KEYS.has(e.expense_type)) {
      fixedExpenses[e.expense_type] = (fixedExpenses[e.expense_type] ?? 0) + amt
      continue
    }
    if (PUC_TO_FIXED[e.expense_type]) {
      const k = PUC_TO_FIXED[e.expense_type]
      fixedExpenses[k] = (fixedExpenses[k] ?? 0) + amt
      continue
    }

    // Gasto adicional: buscar categoría por puc_code, luego por nombre legacy.
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
      amount:       amt,
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
    comision,
    fixedExpenses,
    dynExpenses,
    acpmMatchedInvoiceId,
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
      <NuevaLegalizacionForm trips={trips as any} initialData={initialData} categories={categories as any} combustibleFE={combustibleFE} />
    </div>
  )
}
