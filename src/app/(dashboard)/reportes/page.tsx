import { supabase } from '@/lib/supabase'
import { ReportesClient } from './ReportesClient'

export type MonthData = {
  month: number
  label: string
  ingresos: number
  costos: number
  gastos_financieros: number
  utilidad_bruta: number
  utilidad_neta: number
}

export type EntityData = {
  id: string
  label: string
  ingresos: number
  costos: number
  viajes: number
  utilidad: number
  margen: number
}

export type TipoFilter = 'NEGOCIO' | 'CASA' | 'TODO'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string; mes?: string; tipo?: string }>
}) {
  const sp          = await searchParams
  const year        = parseInt(sp.año  ?? '') || new Date().getFullYear()
  const filterMonth = parseInt(sp.mes  ?? '') || null   // 1-12 or null
  const tipo        = (sp.tipo ?? 'TODO') as TipoFilter

  let from: string, to: string
  if (filterMonth) {
    const lastDay = new Date(year, filterMonth, 0).getDate()
    const mm = String(filterMonth).padStart(2, '0')
    from = `${year}-${mm}-01`
    to   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  } else {
    from = `${year}-01-01`
    to   = `${year}-12-31`
  }

  const [tripsRes, legRes, installRes, bankTxRes, pucRes] = await Promise.all([
    supabase
      .from('trips')
      .select(`
        id, freight_value, delivery_date, status,
        vehicle_id, driver_id, client_id,
        vehicles(plate), drivers(full_name), clients(name)
      `)
      .eq('status', 'PAGADO')
      .gte('delivery_date', from)
      .lte('delivery_date', to),

    supabase
      .from('legalizations')
      .select(`
        id, date, total_expenses,
        trips(vehicle_id, driver_id, client_id,
          vehicles(plate), drivers(full_name), clients(name)
        )
      `)
      .gte('date', from)
      .lte('date', to),

    supabase
      .from('loan_installments')
      .select('id, payment_amount, paid_date')
      .eq('status', 'PAGADA')
      .not('paid_date', 'is', null)
      .gte('paid_date', from)
      .lte('paid_date', to),

    supabase
      .from('bank_transactions')
      .select('id, type, amount, date, category_id, transaction_categories(type, puc_code)')
      .gte('date', from)
      .lte('date', to),

    supabase
      .from('puc_accounts')
      .select('codigo, nombre, tipo')
      .eq('active', true),
  ])

  const trips         = tripsRes.data   ?? []
  const legalizations = legRes.data     ?? []
  const installments  = installRes.data ?? []
  const bankTxns      = bankTxRes.data  ?? []
  const pucAccounts   = pucRes.data     ?? []

  // Build lookup map: codigo → { nombre, tipo }
  const pucMap = new Map<string, { nombre: string; tipo: string }>()
  for (const p of pucAccounts) pucMap.set(p.codigo, { nombre: p.nombre, tipo: p.tipo })

  // ── Estado de resultados por mes ──────────────────────────────────────────
  const months: MonthData[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, label: MESES[i],
    ingresos: 0, costos: 0, gastos_financieros: 0,
    utilidad_bruta: 0, utilidad_neta: 0,
  }))

  if (tipo !== 'CASA') {
    for (const t of trips) {
      const m = new Date((t.delivery_date as string) + 'T00:00:00').getMonth()
      months[m].ingresos += Number(t.freight_value ?? 0)
    }
    for (const l of legalizations) {
      const m = new Date((l.date as string) + 'T00:00:00').getMonth()
      months[m].costos += Number((l as any).total_expenses ?? 0)
    }
    for (const inst of installments) {
      const m = new Date((inst.paid_date as string) + 'T00:00:00').getMonth()
      months[m].gastos_financieros += Number(inst.payment_amount ?? 0)
    }
  }

  for (const tx of bankTxns) {
    const cat     = (tx as any).transaction_categories
    const txFilter = (cat?.type ?? 'NEGOCIO') as 'NEGOCIO' | 'CASA'
    if (tipo === 'NEGOCIO' && txFilter !== 'NEGOCIO') continue
    if (tipo === 'CASA'    && txFilter !== 'CASA')    continue

    const pucTipo = cat?.puc_code ? pucMap.get(cat.puc_code)?.tipo : null
    const m = new Date((tx.date as string) + 'T00:00:00').getMonth()
    if (tx.type === 'INGRESO') {
      months[m].ingresos += Number(tx.amount ?? 0)
    } else if (pucTipo === 'GASTO_FINANCIERO') {
      months[m].gastos_financieros += Number(tx.amount ?? 0)
    } else {
      months[m].costos += Number(tx.amount ?? 0)
    }
  }

  for (const m of months) {
    m.utilidad_bruta = m.ingresos - m.costos
    m.utilidad_neta  = m.utilidad_bruta - m.gastos_financieros
  }

  // ── Rentabilidad por entidad (only for NEGOCIO/TODO) ─────────────────────
  type Stat = { label: string; ingresos: number; costos: number; viajes: number }

  function buildStats(
    tripKey:   (t: any) => string | null,
    tripLabel: (t: any) => string,
    legKey:    (l: any) => string | null,
    legLabel:  (l: any) => string,
  ): EntityData[] {
    const map = new Map<string, Stat>()

    for (const t of trips) {
      const id = tripKey(t)
      if (!id) continue
      if (!map.has(id)) map.set(id, { label: tripLabel(t), ingresos: 0, costos: 0, viajes: 0 })
      const s = map.get(id)!
      s.ingresos += Number(t.freight_value ?? 0)
      s.viajes++
    }
    for (const l of legalizations) {
      const trip = (l as any).trips
      if (!trip) continue
      const id = legKey(l)
      if (!id) continue
      if (!map.has(id)) map.set(id, { label: legLabel(l), ingresos: 0, costos: 0, viajes: 0 })
      map.get(id)!.costos += Number((l as any).total_expenses ?? 0)
    }

    return Array.from(map.entries())
      .map(([id, s]) => ({
        id,
        label:    s.label,
        ingresos: s.ingresos,
        costos:   s.costos,
        viajes:   s.viajes,
        utilidad: s.ingresos - s.costos,
        margen:   s.ingresos > 0 ? Math.round(((s.ingresos - s.costos) / s.ingresos) * 100) : 0,
      }))
      .sort((a, b) => b.ingresos - a.ingresos)
  }

  const byVehicle = tipo !== 'CASA' ? buildStats(
    t => t.vehicle_id,
    t => (t.vehicles as any)?.plate ?? 'Sin placa',
    l => (l as any).trips?.vehicle_id ?? null,
    l => (l as any).trips?.vehicles?.plate ?? 'Sin placa',
  ) : []

  const byDriver = tipo !== 'CASA' ? buildStats(
    t => t.driver_id,
    t => (t.drivers as any)?.full_name ?? 'Sin conductor',
    l => (l as any).trips?.driver_id ?? null,
    l => (l as any).trips?.drivers?.full_name ?? 'Sin conductor',
  ) : []

  const byClient = tipo !== 'CASA' ? buildStats(
    t => t.client_id,
    t => (t.clients as any)?.name ?? 'Sin cliente',
    l => (l as any).trips?.client_id ?? null,
    l => (l as any).trips?.clients?.name ?? 'Sin cliente',
  ) : []

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6">
      <ReportesClient
        year={year}
        filterMonth={filterMonth}
        tipo={tipo}
        availableYears={availableYears}
        months={months}
        byVehicle={byVehicle}
        byDriver={byDriver}
        byClient={byClient}
      />
    </div>
  )
}
