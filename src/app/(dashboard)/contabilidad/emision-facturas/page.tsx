import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import EmisionClient from './EmisionClient'

export const dynamic = 'force-dynamic'

// Elegibles = viajes FACTURADO (desde 2026-07-01) que YA tienen causación CI contabilizada,
// que aún NO tienen emisión CF contabilizada, y cuya factura NO está ANULADA (una cartera
// facturada no puede apoyarse en un documento fiscal anulado).
async function getViajesPendientes() {
  const [ci, cf] = await Promise.all([
    fetchAll<any>((from, to) => supabase.from('journal_entries').select('origen_id').eq('origen_tabla', 'trips').eq('tipo_comprobante', 'CI').eq('estado', 'CONTABILIZADO').order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('journal_entries').select('origen_id').eq('origen_tabla', 'trips').eq('tipo_comprobante', 'CF').eq('estado', 'CONTABILIZADO').order('id', { ascending: true }).range(from, to)),
  ])
  const conCI = new Set(ci.map(x => x.origen_id))
  const conCF = new Set(cf.map(x => x.origen_id))

  const trips = await fetchAll<any>((from, to) => supabase
    .from('trips')
    .select('id, trip_number, load_date, freight_value, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona), invoices(invoice_number, dian_status, created_at)')
    .eq('status', 'FACTURADO')
    .gte('load_date', '2026-07-01')
    .order('load_date').order('id', { ascending: true }).range(from, to))

  return trips
    .filter((t: any) =>
      conCI.has(t.id) && !conCF.has(t.id) &&
      (t.invoices ?? []).some((i: any) => i.dian_status !== 'ANULADA'))
    .map((t: any) => {
      const vigentes = (t.invoices ?? [])
        .filter((i: any) => i.dian_status !== 'ANULADA')
        .sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      return {
        id:         t.id,
        tripNumber: t.trip_number ?? t.id.slice(0, 8),
        fecha:      t.load_date as string,
        flete:      Number(t.freight_value),
        cliente:    t.terceros ? nombreTercero(t.terceros) : '—',
        feit:       vigentes[0]?.invoice_number ?? '—',
      }
    })
}

export default async function EmisionPage() {
  const viajes = await getViajesPendientes()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Emisión de factura (FEIT)</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Viajes ya causados y facturados, pendientes de reclasificar de CxC por facturar a cartera facturada
          (DB 13050501 / CR 13050502). Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Solo aparecen viajes con causación (CI) previa y factura vigente. Los de factura{' '}
          <span className="font-semibold">ANULADA</span> se excluyen automáticamente — quedan en CxC por facturar hasta que se re-facturen.
        </p>
      </div>
      <EmisionClient viajes={viajes} />
    </div>
  )
}
