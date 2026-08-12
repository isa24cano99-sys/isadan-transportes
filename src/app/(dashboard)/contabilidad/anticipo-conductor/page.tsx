import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import AnticipoConductorClient from './AnticipoConductorClient'

export const dynamic = 'force-dynamic'

// Elegibles = movimientos categorizados "Anticipo conductor" (puc 13301510), cuyo
// tercero es un conductor (existe en drivers), desde 2026-07-01 (los pre-corte ya
// están en el saldo de 13301510 del asiento de apertura → registrarlos duplicaría),
// y que aún NO tienen entrega CB contabilizada.
async function getAnticipos() {
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '13301510').limit(1).maybeSingle()
  if (!cat) return []

  const { data: cb } = await supabase
    .from('journal_entries').select('origen_id')
    .eq('origen_tabla', 'bank_transactions').eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO')
  const conCB = new Set((cb ?? []).map(x => x.origen_id))

  const { data: drivers } = await supabase.from('drivers').select('tercero_id, full_name')
  const driverByTer = new Map(
    (drivers ?? []).filter((d: any) => d.tercero_id).map((d: any) => [d.tercero_id, d.full_name]),
  )

  const bts = await fetchAll<any>((from, to) => supabase
    .from('bank_transactions')
    .select('id, date, amount, description, tercero_id')
    .eq('category_id', cat.id)
    .gte('date', '2026-07-01')
    .order('date').order('id', { ascending: true }).range(from, to))

  return bts
    .filter((b: any) => b.tercero_id && driverByTer.has(b.tercero_id) && !conCB.has(b.id))
    .map((b: any) => ({
      id:          b.id,
      fecha:       b.date as string,
      monto:       Number(b.amount),
      conductor:   (driverByTer.get(b.tercero_id) ?? '—') as string,
      descripcion: (b.description ?? '') as string,
    }))
}

export default async function AnticipoConductorPage() {
  const movimientos = await getAnticipos()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Anticipo a conductor</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Entregas de anticipo a conductores desde julio 2026, pendientes de contabilizar
          (DB 13301510 Anticipo a trabajadores / CR 11100510 Banco). Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Es el lado débito de 13301510 — el conductor recibe el anticipo; el evento de porcentaje
          lo acredita cuando se legaliza el gasto. Solo aparecen movimientos cuyo tercero es conductor.
        </p>
      </div>
      <AnticipoConductorClient movimientos={movimientos} />
    </div>
  )
}
