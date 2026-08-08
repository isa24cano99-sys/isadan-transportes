import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevaLegalizacionForm, { LegalizacionInitialData, DynExpenseInit } from '../../nueva/form'
import { FIXED_FIELDS } from '@/lib/legalizacion-fields'
import { getFEClasificadas } from '@/lib/fuel-invoices'
import { FE_LINEA_CUENTA } from '@/lib/fe-lineas'

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
  const [{ data: leg }, { data: expenses }, { data: trips }, { data: cats }, feClasificadas] = await Promise.all([
    supabase
      .from('legalizations')
      .select('id, trip_id, date, advance_amount, total_expenses, status, driver_id, freight_value, trips(freight_value)')
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
    getFEClasificadas(),
  ])
  return { leg, expenses: expenses ?? [], trips: trips ?? [], categories: cats ?? [], feClasificadas }
}

export default async function EditarLegalizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { leg, expenses, trips, categories, feClasificadas } = await getData(id)
  if (!leg) notFound()

  // Reconstruir desde legalization_expenses. Los tipos CON FE (acpm/cargue/descargue) van a
  // feLines — UNA por fila, con su propio enlace (NO se suman, para conservar cada tanqueada
  // y su factura). Los demás fijos se suman en fixedExpenses.
  let percentage = 0
  let comision = 0
  const fixedExpenses: Record<string, number> = {}
  const feLines: { tipo: string; amount: number; matchedInvoiceId: string | null }[] = []
  const dynExpenses: DynExpenseInit[] = []

  for (const e of expenses as any[]) {
    if (e.expense_type === 'porcentaje') {
      percentage = e.description ? Number(e.description) : 0
      continue
    }
    if (e.expense_type === 'comision_empresa') {
      comision = e.amount ?? 0
      continue
    }

    const amt = e.amount ?? 0

    // Clave fija por clave directa, o por PUC (datos legacy guardados por código).
    const key = FIXED_KEYS.has(e.expense_type) ? e.expense_type : (PUC_TO_FIXED[e.expense_type] ?? null)
    if (key) {
      if (key in FE_LINEA_CUENTA) {
        feLines.push({ tipo: key, amount: amt, matchedInvoiceId: e.matched_invoice_id ?? null })
      } else {
        fixedExpenses[key] = (fixedExpenses[key] ?? 0) + amt
      }
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
  // Flete de la LEGALIZACIÓN (el editado/guardado); fallback al del viaje solo si la
  // legalización nunca lo capturó (0/null) — no romper legalizaciones viejas.
  const legFreight = Number((leg as any).freight_value ?? 0)
  const freight    = legFreight > 0 ? legFreight : ((tripData as any)?.freight_value ?? 0)

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
    feLines,
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
      <NuevaLegalizacionForm trips={trips as any} initialData={initialData} categories={categories as any} feClasificadas={feClasificadas} />
    </div>
  )
}
