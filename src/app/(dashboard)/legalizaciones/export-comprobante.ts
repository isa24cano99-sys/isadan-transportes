'use server'

import { supabase } from '@/lib/supabase'

// ── PUC mapping ───────────────────────────────────────────────────────────────

const EXP_TYPE_TO_PUC: Record<string, string> = {
  acpm_contado:     '61450510',
  peajes:           '61450575',
  cargue:           '61450530',
  descargue:        '61450535',
  comision_empresa: '61450525',
  llantas:          '61450555',
  engrase:          '61450545',
  cambio_aceite:    '61450545',
  lavada:           '61450550',
  parqueos:         '61450560',
  carrozada:        '61450570',
  descarrozada:     '61450572',
  varada:           '61450565',
  varadas:          '61450565',
  otros:            '61450585',
  porcentaje:       '61001510',
}

// Fallback names if puc_accounts table is empty for these codes
const PUC_FALLBACK: Record<string, string> = {
  '61450510': 'Combustible (ACPM)',
  '61450525': 'Comisión empresa',
  '61450530': 'Cargue',
  '61450535': 'Descargue',
  '61450545': 'Lubricantes / Engrase',
  '61450550': 'Lavada',
  '61450555': 'Llantas',
  '61450560': 'Parqueos',
  '61450565': 'Varadas',
  '61450570': 'Carrozada',
  '61450572': 'Descarrozada',
  '61450575': 'Peajes',
  '61450585': 'Otras compras',
  '61001510': 'Pago conductor (% flete)',
  '13301510': 'Anticipo a trabajadores',
}

function expTypeToPuc(expType: string): string {
  if (!expType) return '61450585'
  if (/^\d{7,}$/.test(expType)) return expType
  return EXP_TYPE_TO_PUC[expType.toLowerCase()] ?? '61450585'
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComprobanteRow = {
  fecha:           string
  tipoComprobante: string
  descripcion:     string
  cuenta:          string
  nombreCuenta:    string
  tercero:         string
  debito:          number | ''
  credito:         number | ''
}

export type ComprobanteData = {
  tripNumber:    string
  fecha:         string   // YYYYMMDD for filename
  rows:          ComprobanteRow[]
}

export type LegalizacionDetail = {
  id:             string
  date:           string | null
  status:         string
  advanceAmount:  number
  totalExpenses:  number
  balance:        number
  tripNumber:     string
  origin:         string
  destination:    string
  plate:          string
  driverName:     string
  expenses: {
    expenseType:  string
    pucCode:      string
    pucName:      string
    amount:       number
    description:  string | null
  }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateDMY(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function fetchPucNames(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)]
  const { data } = await supabase
    .from('puc_accounts')
    .select('codigo, nombre')
    .in('codigo', unique)

  const map = new Map<string, string>()
  for (const row of (data ?? []) as any[]) {
    map.set(row.codigo, row.nombre)
  }
  // Fill missing with fallback
  for (const code of unique) {
    if (!map.has(code) && PUC_FALLBACK[code]) {
      map.set(code, PUC_FALLBACK[code])
    }
  }
  return map
}

// ── Fetch detail for UI display ───────────────────────────────────────────────

export async function fetchLegalizacionDetailAction(legId: string): Promise<{
  ok: boolean
  data?: LegalizacionDetail
  error?: string
}> {
  const [legRes, expRes] = await Promise.all([
    supabase
      .from('legalizations')
      .select(`
        id, date, status, advance_amount, total_expenses, balance,
        trips(trip_number, origin, destination, vehicles(plate)),
        drivers(full_name)
      `)
      .eq('id', legId)
      .single(),
    supabase
      .from('legalization_expenses')
      .select('expense_type, amount, description')
      .eq('legalization_id', legId),
  ])

  if (legRes.error) return { ok: false, error: legRes.error.message }

  const leg      = legRes.data as any
  const rawExps  = (expRes.data ?? []) as any[]
  const trip     = leg.trips as any
  const plate    = trip?.vehicles?.plate ?? '—'
  const driver   = (leg.drivers?.full_name ?? '—') as string

  const pucCodes = rawExps.map((e: any) => expTypeToPuc(e.expense_type))
  const pucNames = await fetchPucNames(pucCodes)

  const expenses = rawExps.map((e: any) => {
    const pucCode = expTypeToPuc(e.expense_type)
    return {
      expenseType: e.expense_type as string,
      pucCode,
      pucName:     pucNames.get(pucCode) ?? pucCode,
      amount:      Number(e.amount ?? 0),
      description: e.description ?? null,
    }
  })

  return {
    ok: true,
    data: {
      id:            leg.id,
      date:          leg.date ?? null,
      status:        leg.status ?? '',
      advanceAmount: Number(leg.advance_amount ?? 0),
      totalExpenses: Number(leg.total_expenses ?? 0),
      balance:       Number(leg.balance ?? 0),
      tripNumber:    trip?.trip_number ?? '—',
      origin:        trip?.origin       ?? '—',
      destination:   trip?.destination  ?? '—',
      plate,
      driverName:    driver,
      expenses,
    },
  }
}

// ── Fetch data for Dataico comprobante export ─────────────────────────────────

export async function fetchComprobanteAction(legId: string): Promise<{
  ok: boolean
  data?: ComprobanteData
  error?: string
}> {
  const detail = await fetchLegalizacionDetailAction(legId)
  if (!detail.ok || !detail.data) return { ok: false, error: detail.error }

  const d = detail.data
  const dateFormatted = d.date ? fmtDateDMY(d.date) : ''
  const descripcion   = `LEGALIZACION ${dateFormatted}`
  const tercero       = `VEHICULO ${d.plate} ${d.driverName.split(' ').slice(0, 2).join(' ')}`.toUpperCase()

  // Build PUC name map including the anticipo account
  const allCodes = [...d.expenses.map(e => e.pucCode), '13301510']
  const pucNames = await fetchPucNames(allCodes)

  const rows: ComprobanteRow[] = []

  // One DEBIT row per expense
  for (const exp of d.expenses) {
    rows.push({
      fecha:           dateFormatted,
      tipoComprobante: 'Ajustes contables',
      descripcion,
      cuenta:          exp.pucCode,
      nombreCuenta:    exp.pucName,
      tercero,
      debito:          exp.amount,
      credito:         '',
    })
  }

  // One CREDIT row for the advance
  rows.push({
    fecha:           dateFormatted,
    tipoComprobante: 'Ajustes contables',
    descripcion,
    cuenta:          '13301510',
    nombreCuenta:    pucNames.get('13301510') ?? 'Anticipo a trabajadores',
    tercero,
    debito:          '',
    credito:         d.advanceAmount,
  })

  return {
    ok: true,
    data: {
      tripNumber: d.tripNumber,
      fecha:      (d.date ?? '').replace(/-/g, ''),
      rows,
    },
  }
}
