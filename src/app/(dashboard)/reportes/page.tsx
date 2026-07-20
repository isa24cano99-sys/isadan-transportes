import { supabase } from '@/lib/supabase'
import EstadoResultadosClient from './EstadoResultadosClient'

export const dynamic = 'force-dynamic'

// ── Category sets ─────────────────────────────────────────────────────────────
const PERSONAL_COST_CATS   = ['52050610','52059510','52056810','52057010','52057210','52056910','52053010','52053610','52053910','52052710','52058410','52058495']
const GENERAL_COST_CATS    = ['52201005','52304010','52352010','52353010','52353510','52401005','52950510','52956010','51103010']
const FINANCIAL_EXP_CATS   = ['53050505','53050510','53152010']
const TAX_CATS             = ['51150510']
const PERSONAL_OWNER_CATS  = ['52959510','52959511','52959505','52959507','52959520','52959530','52959535']
const ANTICIPO_CATS        = ['28050510']
const ANTICIPO_NO_LEG_CATS = ['13301510']
const FINANCIAL_INC_CATS   = ['42100510']
// Los peajes se toman de `toll_transactions` (agrupados por placa, ver `tolls`).
// Las transacciones bancarias con esta categoría NO se suman en el P&L para evitar
// doble conteo — por eso 61450575 no está en ningún set de arriba y se filtra en extractBankTx.
const PEAJE_PUC_EXCLUIDO   = '61450575'

export type RawInvoice = {
  month: number
  clientName: string
  clientNit: string | null
  invoiceNumber: string | null
  amount: number
}

export type RawTx = {
  month: number
  pucCode: string
  description: string | null
  supplierName: string | null
  categoryName: string | null
  amount: number
}

export type RawAnticipo = {
  month: number
  amount: number
  description: string | null
  clientName: string
  clientNit: string | null
}

export type RawLegExp = {
  month: number
  plate: string | null
  expenseType: string
  amount: number
  description: string | null
}

export type RawToll = {
  month: number
  plate: string | null
  amount: number
}

export type PYLData = {
  year: number
  availableYears: number[]
  invoices: RawInvoice[]
  anticipos: RawAnticipo[]
  legExps: RawLegExp[]
  tolls: RawToll[]
  personalCosts: RawTx[]
  generalCosts: RawTx[]
  financialExps: RawTx[]
  financialIncs: RawTx[]
  taxes: RawTx[]
  personalOwner: RawTx[]
  anticiposNoLeg: RawTx[]
}

function toMonth(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  try {
    const clean = (dateStr as string).substring(0, 10)
    return new Date(clean + 'T00:00:00').getMonth() + 1
  } catch {
    return null
  }
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()
  const from = `${year}-01-01`
  const to   = `${year}-12-31`

  const [invoicesRes, bankTxRes, legExpRes, tollsRes, clientsRes, supRes] = await Promise.all([
    // 1. Invoices EMITIDA
    supabase
      .from('invoices')
      .select('invoice_number, total_amount, issue_date, client_name, client_nit, trips(freight_value, clients(name, nit))')
      .eq('invoice_type', 'EMITIDA')
      .gte('issue_date', from)
      .lte('issue_date', to),

    // 2. All bank transactions for the year (we filter server-side)
    supabase
      .from('bank_transactions')
      .select('type, amount, date, description, supplier_name, supplier_nit, category, transaction_categories(puc_code, name)')
      .gte('date', from)
      .lte('date', to)
      .limit(50000),

    // 3. Legalization expenses with vehicle chain
    supabase
      .from('legalization_expenses')
      .select(`
        expense_type, amount, description, date,
        legalizations(
          trips(
            vehicles(plate)
          )
        )
      `)
      .gte('date', from)
      .lte('date', to),

    // 4. Toll transactions (Flypass)
    supabase
      .from('toll_transactions')
      .select('plate, total, pass_date')
      .gte('pass_date', from + 'T00:00:00')
      .lte('pass_date', to + 'T23:59:59')
      .limit(50000),

    // 5. Terceros conocidos (para resolver anticipos sin supplier_name)
    supabase.from('clients').select('name, nit'),
    supabase.from('supplier_catalog').select('nombre, nit'),
  ])

  // ── Pre-process invoices ───────────────────────────────────────────────────
  const invoices: RawInvoice[] = (invoicesRes.data ?? [])
    .map((inv: any) => {
      const month = toMonth(inv.issue_date)
      if (!month) return null
      const amount =
        Number(inv.total_amount ?? 0) ||
        Number(inv.trips?.freight_value ?? 0)
      const clientName = inv.client_name ?? inv.trips?.clients?.name ?? '—'
      const clientNit  = inv.client_nit  ?? inv.trips?.clients?.nit  ?? null
      return { month, clientName, clientNit, invoiceNumber: inv.invoice_number ?? null, amount }
    })
    .filter(Boolean) as RawInvoice[]

  // ── Pre-process bank transactions ─────────────────────────────────────────
  function pickPuc(tx: any): string | null {
    return (tx.category as string | null) ??
           (tx.transaction_categories as any)?.puc_code ??
           null
  }

  function extractBankTx(cats: string[], txType?: 'INGRESO' | 'EGRESO'): RawTx[] {
    return (bankTxRes.data ?? [])
      .filter((t: any) => {
        const puc = pickPuc(t)
        if (!puc || puc === PEAJE_PUC_EXCLUIDO) return false // peajes → toll_transactions, no banco
        if (!cats.includes(puc)) return false
        if (txType && t.type !== txType) return false
        return true
      })
      .map((t: any) => {
        const month = toMonth(t.date as string)
        if (!month) return null
        return {
          month,
          pucCode:      pickPuc(t)!,
          description:  t.description ?? null,
          supplierName: t.supplier_name ?? null,
          categoryName: (t.transaction_categories as any)?.name ?? null,
          amount:       Number(t.amount ?? 0),
        }
      })
      .filter(Boolean) as RawTx[]
  }

  // ── Anticipos: resolver el cliente de cada transacción ──────────────────────
  const STOP = new Set(['transportes','transporte','trans','transcarga','carga','logistica','logistic',
    'servicios','servicio','sas','sa','s','a','ltda','cia','compania','de','del','la','el','y','e','zomac','sociedad','anonima'])
  const norm = (s: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const known = [
    ...((clientsRes.data ?? []) as any[]).map(c => ({ name: c.name as string, nit: (c.nit as string | null) ?? null })),
    ...((supRes.data ?? []) as any[]).map(s => ({ name: s.nombre as string, nit: (s.nit as string | null) ?? null })),
  ].filter(k => k.name)
   .map(k => ({ ...k, keywords: [...new Set(norm(k.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))] }))
   .filter(k => k.keywords.length > 0)

  function resolveCliente(supName: string | null, supNit: string | null, desc: string | null): { name: string; nit: string | null } {
    if (supName && supName.trim()) return { name: supName.trim(), nit: supNit?.trim() || null }
    const hay = norm(desc) + ' ' + norm(supName)
    let best: { name: string; nit: string | null } | null = null
    let bestScore = 0
    for (const k of known) {
      const score = k.keywords.filter(w => hay.includes(w)).length
      if (score > bestScore) { bestScore = score; best = { name: k.name, nit: k.nit } }
    }
    return best ?? { name: 'Sin cliente asignado', nit: null }
  }

  const anticipos: RawAnticipo[] = (bankTxRes.data ?? [])
    .filter((t: any) => pickPuc(t) === '28050510' && t.type === 'INGRESO')
    .map((t: any) => {
      const month = toMonth(t.date as string)
      if (!month) return null
      const cli = resolveCliente(t.supplier_name ?? null, t.supplier_nit ?? null, t.description ?? null)
      return { month, amount: Number(t.amount ?? 0), description: t.description ?? null, clientName: cli.name, clientNit: cli.nit }
    })
    .filter(Boolean) as RawAnticipo[]

  const personalCosts  = extractBankTx(PERSONAL_COST_CATS, 'EGRESO')
  const generalCosts   = extractBankTx(GENERAL_COST_CATS, 'EGRESO')
  const financialExps  = extractBankTx(FINANCIAL_EXP_CATS, 'EGRESO')
  const financialIncs  = extractBankTx(FINANCIAL_INC_CATS, 'INGRESO')
  const taxes          = extractBankTx(TAX_CATS, 'EGRESO')
  const personalOwner  = extractBankTx(PERSONAL_OWNER_CATS, 'EGRESO')
  const anticiposNoLeg = extractBankTx(ANTICIPO_NO_LEG_CATS)

  // ── Pre-process legalization expenses ─────────────────────────────────────
  const legExps: RawLegExp[] = (legExpRes.data ?? [])
    .map((e: any) => {
      const month = toMonth(e.date)
      if (!month || !e.amount) return null
      const leg     = e.legalizations
      const trip    = leg?.trips
      const vehicle = trip?.vehicles
      return {
        month,
        plate:       (vehicle?.plate as string | null) ?? null,
        expenseType: e.expense_type as string ?? 'otros',
        amount:      Number(e.amount),
        description: e.description ?? null,
      }
    })
    .filter(Boolean) as RawLegExp[]

  // ── Pre-process tolls ─────────────────────────────────────────────────────
  const tolls: RawToll[] = (tollsRes.data ?? [])
    .map((t: any) => {
      const month = toMonth(t.pass_date as string)
      if (!month) return null
      return { month, plate: (t.plate as string | null) ?? null, amount: Number(t.total ?? 0) }
    })
    .filter(Boolean) as RawToll[]

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const pylData: PYLData = {
    year, availableYears,
    invoices, anticipos, legExps, tolls,
    personalCosts, generalCosts, financialExps, financialIncs,
    taxes, personalOwner, anticiposNoLeg,
  }

  return <EstadoResultadosClient {...pylData} />
}
