import { supabase } from '@/lib/supabase'
import { nombreTercero } from '@/lib/tercero-nombre'
import CausacionesClient from './CausacionesClient'

export const dynamic = 'force-dynamic'

// Elegibles = viajes FINALIZADO o FACTURADO, desde 2026-07-01 (corte de la apertura;
// los de antes ya están en el resultado acumulado del asiento de apertura → causarlos
// duplicaría el ingreso), y que aún NO tienen causación CI contabilizada.
async function getViajesPendientes() {
  const { data: causados } = await supabase
    .from('journal_entries')
    .select('origen_id')
    .eq('origen_tabla', 'trips')
    .eq('tipo_comprobante', 'CI')
    .eq('estado', 'CONTABILIZADO')
  const yaCausados = new Set((causados ?? []).map(c => c.origen_id))

  const { data: trips } = await supabase
    .from('trips')
    .select('id, trip_number, status, load_date, freight_value, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona), vehicles(plate), drivers(full_name)')
    .in('status', ['FINALIZADO', 'FACTURADO'])
    .gte('load_date', '2026-07-01')
    .order('load_date')

  return (trips ?? [])
    .filter((t: any) => !yaCausados.has(t.id))
    .map((t: any) => ({
      id:         t.id,
      tripNumber: t.trip_number ?? t.id.slice(0, 8),
      status:     t.status as string,
      fecha:      t.load_date as string,
      flete:      Number(t.freight_value),
      cliente:    t.terceros ? nombreTercero(t.terceros) : '—',
      placa:      t.vehicles?.plate ?? null,
      conductor:  t.drivers?.full_name ?? null,
    }))
}

export default async function CausacionesPage() {
  const viajes = await getViajesPendientes()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Causación de ingresos</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Viajes finalizados o facturados desde julio 2026, pendientes de causar (DB 13050502 CxC por facturar / CR 41450510 Ingresos).
          Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Los viajes <span className="font-semibold text-amber-600">FACTURADO</span> quedan causados pero pendientes de reclasificar a cartera facturada
          (evento 2, emisión FEIT) — es un estado transitorio correcto hasta que exista esa pantalla.
        </p>
      </div>
      <CausacionesClient viajes={viajes} />
    </div>
  )
}
