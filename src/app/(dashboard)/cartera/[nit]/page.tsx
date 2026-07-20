import { supabase } from '@/lib/supabase'
import CarteraDetailClient from './CarteraDetailClient'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { type ClientPayment } from '../actions'

export const dynamic = 'force-dynamic'

export type CarteraEntry = {
  id: string
  clientName: string
  clientNit: string | null
  invoiceNumber: string | null
  invoiceAmount: number
  invoiceDate: string | null
  advanceManifiesto: number   // trips.advance_amount del viaje
  advanceReceived: number     // suma de anticipos recibidos (bank) del viaje
  advanceAmount: number       // = advanceReceived (compatibilidad)
  balance: number
  status: 'PENDIENTE' | 'ABONADA' | 'PAGADA'
  paidDate: string | null
  notes: string | null
}

export type UnappliedAnticipo = {
  id: string
  description: string | null
  amount: number
  date: string | null
  hasTrip: boolean
}

export default async function CarteraDetailPage({
  params,
}: {
  params: Promise<{ nit: string }>
}) {
  const { nit: rawNit } = await params
  const nit = decodeURIComponent(rawNit)

  const [{ data: entries, error }, { data: paymentsData }, { data: invRows }, { data: antRows }] = await Promise.all([
    supabase
      .from('accounts_receivable_entries')
      .select('id, client_name, client_nit, invoice_id, invoice_number, invoice_amount, invoice_date, advance_amount, balance, status, paid_date, notes')
      .or(`client_nit.eq.${nit},client_name.eq.${nit}`)
      .order('invoice_date', { ascending: true }),
    supabase
      .from('client_payments')
      .select('id, amount, payment_date, description, covered_invoices, saldo_a_favor, created_at')
      .or(`client_nit.eq.${nit},client_name.eq.${nit}`)
      .order('payment_date', { ascending: false }),
    // Facturas del cliente → trip_id (para cruzar anticipos por viaje)
    supabase
      .from('invoices')
      .select('id, trip_id')
      .or(`client_nit.eq.${nit},client_name.eq.${nit}`)
      .eq('invoice_type', 'EMITIDA'),
    // Anticipos de clientes en bancos (28050510 · INGRESO)
    supabase
      .from('bank_transactions')
      .select('id, amount, supplier_nit, supplier_name, reference_type, reference_id, description, date')
      .eq('category', '28050510')
      .eq('type', 'INGRESO')
      .limit(5000),
  ])

  const payments = (paymentsData ?? []) as ClientPayment[]

  if (error?.code === '42P01') {
    return (
      <div className="p-6 text-sm text-[#64748B]">
        Tabla no existe. Ejecuta el SQL en Supabase.
      </div>
    )
  }

  const rows = (entries ?? []) as any[]

  const clientName = rows[0]?.client_name ?? nit
  const clientNit  = rows[0]?.client_nit  ?? null

  // ── Cruce de anticipos por viaje ────────────────────────────────────────────
  const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
  const cNit = digits(clientNit)

  const invTrip = new Map<string, string>()   // invoice_id → trip_id
  for (const i of (invRows ?? []) as any[]) if (i.trip_id) invTrip.set(i.id, i.trip_id)
  const clientTripSet = new Set(invTrip.values())

  // Anticipo del MANIFIESTO: trips.advance_amount de cada viaje del cliente
  const tripIds = [...clientTripSet]
  const { data: tripRows } = tripIds.length
    ? await supabase.from('trips').select('id, advance_amount').in('id', tripIds)
    : { data: [] as any[] }
  const tripAdvance = new Map<string, number>()
  for (const t of (tripRows ?? []) as any[]) tripAdvance.set(t.id, Number(t.advance_amount ?? 0))

  // Anticipo RECIBIDO: bank_transactions 28050510/INGRESO cuyo viaje (reference_id) = trip_id de la factura
  const receivedByTrip = new Map<string, { sum: number; list: any[] }>()
  for (const a of (antRows ?? []) as any[]) {
    if (a.reference_type === 'TRIP' && a.reference_id) {
      const g = receivedByTrip.get(a.reference_id) ?? { sum: 0, list: [] }
      g.sum += Number(a.amount ?? 0); g.list.push(a)
      receivedByTrip.set(a.reference_id, g)
    }
  }

  // Viajes que ya están asociados a una factura del cliente (para separar los no aplicados)
  const entryTrips = new Set<string>()
  for (const e of rows) { const tr = e.invoice_id ? invTrip.get(e.invoice_id) : null; if (tr) entryTrips.add(tr) }

  const carteraEntries: CarteraEntry[] = rows.map(e => {
    const invoiceAmount = Number(e.invoice_amount ?? 0)
    const tripId        = e.invoice_id ? (invTrip.get(e.invoice_id) ?? null) : null
    const manifiesto    = tripId ? (tripAdvance.get(tripId) ?? 0) : 0
    const recibidoG     = tripId ? receivedByTrip.get(tripId) : undefined
    if (tripId) console.log('Anticipos encontrados para trip_id:', tripId, recibidoG?.list ?? [])
    // Recibido por viaje; si no hay cruce, conserva el anticipo existente de la entry
    const advanceReceived = (recibidoG?.sum ?? 0) > 0 ? recibidoG!.sum : Number(e.advance_amount ?? 0)
    const balance         = invoiceAmount - advanceReceived
    const stored          = e.status as 'PENDIENTE' | 'ABONADA' | 'PAGADA'
    const status: 'PENDIENTE' | 'ABONADA' | 'PAGADA' =
      stored === 'PAGADA' ? 'PAGADA' : balance <= 0 ? 'PAGADA' : advanceReceived > 0 ? 'ABONADA' : 'PENDIENTE'
    return {
      id:               e.id,
      clientName:       e.client_name  ?? '—',
      clientNit:        e.client_nit   ?? null,
      invoiceNumber:    e.invoice_number ?? null,
      invoiceAmount,
      invoiceDate:      e.invoice_date  ?? null,
      advanceManifiesto: manifiesto,
      advanceReceived,
      advanceAmount:    advanceReceived,
      balance,
      status,
      paidDate:         e.paid_date ?? null,
      notes:            e.notes ?? null,
    }
  })

  // Anticipos sin aplicar: los del cliente (por NIT o descripción) cuyo viaje no pertenece a ninguna factura
  const nitMatch = (a: string | null | undefined) => {
    const x = digits(a)
    if (!cNit || !x || Math.min(x.length, cNit.length) < 8) return false
    return x === cNit || x.startsWith(cNit) || cNit.startsWith(x)
  }
  const unappliedAnticipos: UnappliedAnticipo[] = ((antRows ?? []) as any[])
    .filter(a =>
      nitMatch(a.supplier_nit) ||
      (!!cNit && digits(a.description).includes(cNit)) ||
      (a.reference_type === 'TRIP' && a.reference_id && clientTripSet.has(a.reference_id)))
    .filter(a => !(a.reference_type === 'TRIP' && a.reference_id && entryTrips.has(a.reference_id)))
    .map(a => ({
      id: a.id, description: a.description ?? null, amount: Number(a.amount ?? 0),
      date: a.date ?? null, hasTrip: a.reference_type === 'TRIP' && !!a.reference_id,
    }))
    .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))

  const totalFacturado = carteraEntries.reduce((s, e) => s + e.invoiceAmount, 0)
  const totalAnticipos = carteraEntries.reduce((s, e) => s + e.advanceReceived, 0)
  const totalPendiente = carteraEntries.filter(e => e.status !== 'PAGADA').reduce((s, e) => s + Math.max(0, e.balance), 0)

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back */}
      <Link href="/cartera" className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
        <ArrowLeft size={14} />
        Cartera
      </Link>

      {/* Client header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A]">{clientName}</h1>
            {clientNit && (
              <p className="text-xs text-[#64748B] font-mono mt-0.5">NIT {clientNit}</p>
            )}
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              { label: 'Total facturado', value: totalFacturado, cls: 'text-[#0F172A]' },
              { label: 'Total anticipos', value: totalAnticipos, cls: 'text-[#64748B]' },
              { label: 'Saldo pendiente', value: totalPendiente, cls: totalPendiente > 0 ? 'text-yellow-700 font-semibold' : 'text-green-700 font-semibold' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-right">
                <p className={`text-base tabular-nums ${cls}`}>
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)}
                </p>
                <p className="text-xs text-[#94A3B8]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CarteraDetailClient
        entries={carteraEntries}
        payments={payments}
        unapplied={unappliedAnticipos}
        clientName={clientName}
        clientNit={clientNit}
      />
    </div>
  )
}
