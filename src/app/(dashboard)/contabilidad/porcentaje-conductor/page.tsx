import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import PorcentajeClient from './PorcentajeClient'

export const dynamic = 'force-dynamic'

// Elegibles = legalizations APROBADA, fecha >= 2026-07-01 (corte apertura: los porcentajes
// pre-corte ya están en el resultado acumulado 3610 y en el saldo por conductor de 13301510
// del asiento CA-1 → contabilizarlos duplica), con línea de porcentaje en legalization_expenses,
// y sin CG de porcentaje (61450550) ya contabilizado para esa legalización.
async function getElegibles() {
  const legs = await fetchAll<any>((from, to) => supabase
    .from('legalizations')
    .select('id, date, driver_id, vehicle_id')
    .eq('status', 'APROBADA')
    .gte('date', '2026-07-01')
    .order('date').order('id', { ascending: true }).range(from, to))

  if (!legs.length) return []
  const legIds = legs.map(l => l.id)

  const { data: porc } = await supabase
    .from('legalization_expenses')
    .select('legalization_id, amount')
    .eq('expense_type', 'porcentaje')
    .in('legalization_id', legIds)
  const porcMap = new Map((porc ?? []).map(p => [p.legalization_id, Number(p.amount)]))

  // legalizaciones con CG de porcentaje (61450550) ya contabilizado
  const cgLines = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('journal_entries!inner(origen_tabla, origen_id, tipo_comprobante, estado)')
    .eq('cuenta_puc', '61450550')
    .eq('journal_entries.origen_tabla', 'legalizations')
    .eq('journal_entries.tipo_comprobante', 'CG')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  const posted = new Set(cgLines.map((x: any) => x.journal_entries?.origen_id))

  const { data: drivers } = await supabase.from('drivers').select('id, full_name, tercero_id')
  const drvMap = new Map((drivers ?? []).map((d: any) => [d.id, d]))
  const { data: vehicles } = await supabase.from('vehicles').select('id, plate')
  const vehMap = new Map((vehicles ?? []).map((v: any) => [v.id, v.plate]))

  return legs
    .filter(l => porcMap.has(l.id) && !posted.has(l.id))
    .map(l => {
      const drv: any = drvMap.get(l.driver_id)
      return {
        id:        l.id,
        fecha:     l.date as string,
        conductor: (drv?.full_name ?? '—') as string,
        driverId:  l.driver_id as string,
        sinTercero: !drv?.tercero_id,
        placa:     (vehMap.get(l.vehicle_id) ?? '') as string,
        monto:     porcMap.get(l.id) ?? 0,
      }
    })
}

export default async function PorcentajePage() {
  const elegibles = await getElegibles()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Porcentaje conductor</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Legalizaciones aprobadas desde julio 2026 con porcentaje de conductor pendiente de
          contabilizar (DB 61450550 Porcentaje / CR 13301510 Anticipo a trabajadores). Nada se
          contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          El monto es el porcentaje ya calculado (flete × %) guardado en la legalización. El tercero
          es el conductor; el centro de costo, la placa.
        </p>
      </div>
      <PorcentajeClient elegibles={elegibles} />
    </div>
  )
}
