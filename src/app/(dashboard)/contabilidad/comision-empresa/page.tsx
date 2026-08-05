import { supabase } from '@/lib/supabase'
import ComisionClient from './ComisionClient'

export const dynamic = 'force-dynamic'

// Elegibles = legalizations APROBADA, fecha >= 2026-07-01, con línea estructurada
// expense_type='comision_empresa' (inmune al texto), sin CG de comisión (61450580)
// ya contabilizado. El costo pre-corte ya está en 3610 → se excluye por fecha.
async function getElegibles() {
  const { data: legs } = await supabase
    .from('legalizations')
    .select('id, date, vehicle_id')
    .eq('status', 'APROBADA')
    .gte('date', '2026-07-01')
    .order('date')

  if (!legs?.length) return []
  const legIds = legs.map(l => l.id)

  const { data: comis } = await supabase
    .from('legalization_expenses')
    .select('legalization_id, amount')
    .eq('expense_type', 'comision_empresa')
    .in('legalization_id', legIds)
  const comisMap = new Map((comis ?? []).map(c => [c.legalization_id, Number(c.amount)]))

  const { data: cgLines } = await supabase
    .from('journal_entry_lines')
    .select('journal_entries!inner(origen_tabla, origen_id, tipo_comprobante, estado)')
    .eq('cuenta_puc', '61450580')
    .eq('journal_entries.origen_tabla', 'legalizations')
    .eq('journal_entries.tipo_comprobante', 'CG')
    .eq('journal_entries.estado', 'CONTABILIZADO')
  const posted = new Set((cgLines ?? []).map((x: any) => x.journal_entries?.origen_id))

  const { data: vehicles } = await supabase.from('vehicles').select('id, plate')
  const vehMap = new Map((vehicles ?? []).map((v: any) => [v.id, v.plate]))

  return legs
    .filter(l => comisMap.has(l.id) && !posted.has(l.id))
    .map(l => ({
      id:    l.id,
      fecha: l.date as string,
      placa: (vehMap.get(l.vehicle_id) ?? '') as string,
      monto: comisMap.get(l.id) ?? 0,
    }))
}

export default async function ComisionEmpresaPage() {
  const elegibles = await getElegibles()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Comisión empresa</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Legalizaciones aprobadas desde julio 2026 con comisión empresa pendiente de contabilizar
          (DB 61450580 Comisión empresa / CR 13301510 Anticipo a trabajadores). Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          El tercero es Consumidor Final (fijo); el centro de costo, la placa. El monto sale del campo
          estructurado de la legalización.
        </p>
      </div>
      <ComisionClient elegibles={elegibles} />
    </div>
  )
}
