import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import FacturasDataicoClient, { type FacturaRow, type ViajeSinFactura } from '../FacturasDataicoClient'

export const dynamic = 'force-dynamic'

async function getData(): Promise<{ facturas: FacturaRow[]; viajesSinFactura: ViajeSinFactura[] }> {
  const [invRes, tripsRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('invoice_type', 'EMITIDA'),
    supabase
      .from('trips')
      .select('id, trip_number, origin, destination, load_date, freight_value, clients(name)')
      .eq('status', 'FINALIZADO')
      .is('dataico_invoice_id', null)
      .order('load_date', { ascending: false }),
  ])

  const facturas: FacturaRow[] = ((invRes.data ?? []) as any[])
    .map(r => ({
      id:             r.id,
      invoice_number: r.invoice_number ?? null,
      issue_date:     r.issue_date ?? null,
      client_name:    r.client_name ?? null,
      total_amount:   r.total_amount ?? null,
      pdf_url:        r.pdf_url ?? null,
      anulada:        !!(r.dian_status === 'ANULADA' || r.credit_note_id || r.credit_note_number),
    }))
    .sort((a, b) => (b.issue_date ?? '').localeCompare(a.issue_date ?? ''))

  const viajesSinFactura: ViajeSinFactura[] = ((tripsRes.data ?? []) as any[]).map(t => ({
    id:            t.id,
    trip_number:   t.trip_number ?? null,
    origin:        t.origin ?? null,
    destination:   t.destination ?? null,
    load_date:     t.load_date ?? null,
    freight_value: t.freight_value ?? null,
    client_name:   t.clients?.name ?? null,
  }))

  return { facturas, viajesSinFactura }
}

export default async function FacturasClientesPage() {
  const { facturas, viajesSinFactura } = await getData()
  const now = new Date()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link href="/facturas" className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
        <ArrowLeft size={15} /> Facturación
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Facturas clientes</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Facturas FEIT emitidas · importa el Excel de Dataico.</p>
      </div>

      <FacturasDataicoClient
        facturas={facturas}
        viajesSinFactura={viajesSinFactura}
        defaultMes={String(now.getMonth() + 1)}
        defaultAnio={String(now.getFullYear())}
      />
    </div>
  )
}
