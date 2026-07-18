import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import FacturasDataicoClient, { type FacturaRow, type ViajeSinFactura } from './FacturasDataicoClient'
import PeajesFlypassClient from './PeajesFlypassClient'
import PeajesImportadosClient, { type TollLite } from './PeajesImportadosClient'

export const dynamic = 'force-dynamic'

async function getFacturacionData(): Promise<{
  facturas: FacturaRow[]
  viajesSinFactura: ViajeSinFactura[]
  tolls: TollLite[]
}> {
  const [invRes, tripsRes, tollsRes] = await Promise.all([
    // Facturas emitidas — select('*') para tolerar columnas que aún no existan.
    supabase.from('invoices').select('*').eq('invoice_type', 'EMITIDA'),
    supabase
      .from('trips')
      .select('id, trip_number, origin, destination, load_date, freight_value, clients(name)')
      .eq('status', 'FINALIZADO')
      .is('dataico_invoice_id', null)
      .order('load_date', { ascending: false }),
    supabase
      .from('toll_transactions')
      .select('id, plate, pass_date, total')
      .order('pass_date', { ascending: false }),
  ])

  const facturas: FacturaRow[] = ((invRes.data ?? []) as any[])
    .map(r => ({
      id:             r.id,
      invoice_number: r.invoice_number ?? null,
      issue_date:     r.issue_date ?? null,
      client_name:    r.client_name ?? null,
      total_amount:   r.total_amount ?? null,
      pdf_url:        r.pdf_url ?? null,
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

  const tolls: TollLite[] = ((tollsRes.data ?? []) as any[]).map(t => ({
    id:        t.id,
    plate:     t.plate ?? null,
    pass_date: t.pass_date ?? null,
    total:     Number(t.total ?? 0),
  }))

  return { facturas, viajesSinFactura, tolls }
}

export default async function FacturasPage() {
  const { facturas, viajesSinFactura, tolls } = await getFacturacionData()
  const now = new Date()
  const defaultMes  = String(now.getMonth() + 1)
  const defaultAnio = String(now.getFullYear())

  return (
    <div className="p-4 md:p-6 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Facturación</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Ingresos facturados y peajes Flypass.
          </p>
        </div>
        <Link
          href="/facturas/importar"
          className="group inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:underline"
        >
          Cruce DIAN / CUFE
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Sección 1: Ingresos Facturados */}
      <FacturasDataicoClient
        facturas={facturas}
        viajesSinFactura={viajesSinFactura}
        defaultMes={defaultMes}
        defaultAnio={defaultAnio}
      />

      {/* Sección 2: Peajes Flypass → bancos */}
      <div className="pt-8 border-t border-[#E2E8F0]">
        <PeajesFlypassClient />
      </div>

      {/* Sección 3: Peajes ya importados */}
      <div className="pt-8 border-t border-[#E2E8F0]">
        <PeajesImportadosClient tolls={tolls} />
      </div>
    </div>
  )
}
