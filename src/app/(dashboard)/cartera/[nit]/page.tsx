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
  advanceAmount: number
  balance: number
  status: 'PENDIENTE' | 'ABONADA' | 'PAGADA'
  paidDate: string | null
  notes: string | null
}

export default async function CarteraDetailPage({
  params,
}: {
  params: Promise<{ nit: string }>
}) {
  const { nit: rawNit } = await params
  const nit = decodeURIComponent(rawNit)

  const [{ data: entries, error }, { data: paymentsData }] = await Promise.all([
    supabase
      .from('accounts_receivable_entries')
      .select('id, client_name, client_nit, invoice_number, invoice_amount, invoice_date, advance_amount, balance, status, paid_date, notes')
      .or(`client_nit.eq.${nit},client_name.eq.${nit}`)
      .order('invoice_date', { ascending: true }),
    supabase
      .from('client_payments')
      .select('id, amount, payment_date, description, covered_invoices, saldo_a_favor, created_at')
      .or(`client_nit.eq.${nit},client_name.eq.${nit}`)
      .order('payment_date', { ascending: false }),
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

  const totalFacturado = rows.reduce((s, e) => s + Number(e.invoice_amount ?? 0), 0)
  const totalAnticipos = rows.reduce((s, e) => s + Number(e.advance_amount ?? 0), 0)
  const totalPendiente = rows
    .filter(e => e.status !== 'PAGADA')
    .reduce((s, e) => s + Number(e.balance ?? 0), 0)

  const carteraEntries: CarteraEntry[] = rows.map(e => ({
    id:            e.id,
    clientName:    e.client_name  ?? '—',
    clientNit:     e.client_nit   ?? null,
    invoiceNumber: e.invoice_number ?? null,
    invoiceAmount: Number(e.invoice_amount ?? 0),
    invoiceDate:   e.invoice_date  ?? null,
    advanceAmount: Number(e.advance_amount ?? 0),
    balance:       Number(e.balance ?? 0),
    status:        e.status as 'PENDIENTE' | 'ABONADA' | 'PAGADA',
    paidDate:      e.paid_date ?? null,
    notes:         e.notes ?? null,
  }))

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
        clientName={clientName}
        clientNit={clientNit}
      />
    </div>
  )
}
