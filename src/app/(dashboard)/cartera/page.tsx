import { supabase } from '@/lib/supabase'
import CarteraClient from './CarteraClient'

export const dynamic = 'force-dynamic'

export type ClienteSummary = {
  clientNit:      string | null
  clientName:     string
  clientId:       string | null
  totalFacturado: number
  totalAnticipos: number
  totalPagado:    number
  pendiente:      number
  invoiceCount:   number
  pendienteCount: number
  abonadaCount:   number
  pagadaCount:    number
}

export type CarteraKPIs = {
  totalFacturado:    number
  totalAnticipos:    number
  totalCartera:      number
  sinAplicar:        number
  tableExists:       boolean
}

export default async function CarteraPage() {
  // ── Entries ─────────────────────────────────────────────────────────────
  const { data: entries, error: entErr } = await supabase
    .from('accounts_receivable_entries')
    .select('id, client_id, client_name, client_nit, invoice_amount, advance_amount, balance, status')

  const tableExists = entErr?.code !== '42P01'

  // ── Total facturas emitidas (all-time, from invoices table) ──────────────
  const { data: invoicesData } = await supabase
    .from('invoices')
    .select('total_amount')
    .eq('invoice_type', 'EMITIDA')

  const totalFacturado = (invoicesData ?? []).reduce((s, i) => s + Number((i as any).total_amount ?? 0), 0)

  // ── Total anticipos from bank_transactions ────────────────────────────────
  const { data: catRows } = await supabase
    .from('transaction_categories')
    .select('id')
    .eq('puc_code', '28050510')

  const catIds = (catRows ?? []).map((c: any) => c.id)

  const [directAntRes, catAntRes] = await Promise.all([
    supabase
      .from('bank_transactions')
      .select('amount')
      .eq('type', 'INGRESO')
      .eq('category', '28050510'),
    catIds.length > 0
      ? supabase
          .from('bank_transactions')
          .select('amount')
          .eq('type', 'INGRESO')
          .in('category_id', catIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const totalAnticipos =
    (directAntRes.data ?? []).reduce((s, t) => s + Number((t as any).amount ?? 0), 0) +
    ((catAntRes.data ?? []) as any[]).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0)

  // ── Build KPIs and client summaries from entries ──────────────────────────
  const rows = (entries ?? []) as any[]

  const totalAplicados = rows.reduce((s, e) => s + Number(e.advance_amount ?? 0), 0)
  const totalCartera   = rows
    .filter(e => e.status !== 'PAGADA')
    .reduce((s, e) => s + Number(e.balance ?? 0), 0)

  const kpis: CarteraKPIs = {
    totalFacturado,
    totalAnticipos,
    totalCartera,
    sinAplicar:  Math.max(0, totalAnticipos - totalAplicados),
    tableExists,
  }

  const clientMap = new Map<string, ClienteSummary>()
  for (const e of rows) {
    const key = e.client_nit ?? e.client_name ?? 'SIN_CLIENTE'
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        clientNit:      e.client_nit  ?? null,
        clientName:     e.client_name ?? 'Sin nombre',
        clientId:       e.client_id   ?? null,
        totalFacturado: 0,
        totalAnticipos: 0,
        totalPagado:    0,
        pendiente:      0,
        invoiceCount:   0,
        pendienteCount: 0,
        abonadaCount:   0,
        pagadaCount:    0,
      })
    }
    const c = clientMap.get(key)!
    c.totalFacturado += Number(e.invoice_amount ?? 0)
    c.totalAnticipos += Number(e.advance_amount ?? 0)
    c.invoiceCount++
    if (e.status === 'PAGADA') {
      c.pagadaCount++
      c.totalPagado += Number(e.invoice_amount ?? 0)
    } else if (e.status === 'ABONADA') {
      c.abonadaCount++
    } else {
      c.pendienteCount++
    }
    c.pendiente = c.totalFacturado - c.totalAnticipos - c.totalPagado
  }

  const clients = Array.from(clientMap.values()).sort((a, b) => b.pendiente - a.pendiente)

  return <CarteraClient kpis={kpis} clients={clients} />
}
