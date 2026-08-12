import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import CarteraClient from './CarteraClient'

export const dynamic = 'force-dynamic'

export type EstadoCartera = 'AL_DIA' | 'PENDIENTE' | 'VENCIDO'

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
  estado:         EstadoCartera
}

const DIAS_VENCIMIENTO = 45

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
    .select('id, client_id, client_name, client_nit, invoice_number, invoice_amount, invoice_date, advance_amount, balance, status')

  const tableExists = entErr?.code !== '42P01'

  // ── Total facturas emitidas (all-time, from invoices table) ──────────────
  const invoicesData = await fetchAll<any>((from, to) => supabase
    .from('invoices')
    .select('total_amount, invoice_number, dian_status, credit_note_id, credit_note_number')
    .eq('invoice_type', 'EMITIDA')
    .order('id', { ascending: true }).range(from, to))

  // Facturas anuladas (dian_status ANULADA o con nota crédito) → no cuentan (neto $0)
  const esAnul = (i: any) => i.dian_status === 'ANULADA' || i.credit_note_id || i.credit_note_number
  const annulledInvNums = new Set((invoicesData as any[]).filter(esAnul).map(i => i.invoice_number))
  const totalFacturado = (invoicesData as any[])
    .filter(i => !esAnul(i))
    .reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

  // ── Total anticipos from bank_transactions ────────────────────────────────
  const { data: catRows } = await supabase
    .from('transaction_categories')
    .select('id')
    .eq('puc_code', '28050510')

  const catIds = (catRows ?? []).map((c: any) => c.id)

  const [directAnt, catAnt] = await Promise.all([
    fetchAll<any>((from, to) => supabase
      .from('bank_transactions')
      .select('amount')
      .eq('type', 'INGRESO')
      .eq('category', '28050510')
      .order('id', { ascending: true }).range(from, to)),
    catIds.length > 0
      ? fetchAll<any>((from, to) => supabase
          .from('bank_transactions')
          .select('amount')
          .eq('type', 'INGRESO')
          .in('category_id', catIds)
          .order('id', { ascending: true }).range(from, to))
      : Promise.resolve([] as any[]),
  ])

  const totalAnticipos =
    (directAnt as any[]).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0) +
    (catAnt as any[]).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0)

  // ── Build KPIs and client summaries from entries (sin facturas anuladas) ──
  const rows = ((entries ?? []) as any[]).filter(e => !annulledInvNums.has(e.invoice_number))

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

  // Fecha de corte para VENCIDO (factura pendiente más antigua que esto).
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - DIAS_VENCIMIENTO)
  const cutoff = cutoffDate.toISOString().slice(0, 10)

  const clientMap = new Map<string, ClienteSummary>()
  const hasVencida = new Map<string, boolean>()
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
        estado:         'AL_DIA',
      })
    }
    const c = clientMap.get(key)!
    c.totalFacturado += Number(e.invoice_amount ?? 0)
    c.totalAnticipos += Number(e.advance_amount ?? 0)
    c.totalPagado    += Number(e.advance_amount ?? 0)  // plata recibida/aplicada
    c.invoiceCount++
    if (e.status === 'PAGADA')      c.pagadaCount++
    else if (e.status === 'ABONADA') c.abonadaCount++
    else                             c.pendienteCount++

    // ¿Factura pendiente vencida? (no pagada, con saldo, emitida antes del corte)
    if (e.status !== 'PAGADA' && Number(e.balance ?? 0) > 0 && e.invoice_date && e.invoice_date < cutoff) {
      hasVencida.set(key, true)
    }
  }

  for (const [key, c] of clientMap) {
    c.pendiente = c.totalFacturado - c.totalPagado
    c.estado = c.pendiente <= 0 ? 'AL_DIA' : (hasVencida.get(key) ? 'VENCIDO' : 'PENDIENTE')
  }

  const clients = Array.from(clientMap.values()).sort((a, b) => b.pendiente - a.pendiente)

  return <CarteraClient kpis={kpis} clients={clients} />
}
