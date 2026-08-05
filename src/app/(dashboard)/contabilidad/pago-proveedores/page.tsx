import { supabase } from '@/lib/supabase'
import { nombreTercero } from '@/lib/tercero-nombre'
import PagoProveedoresClient from './PagoProveedoresClient'

export const dynamic = 'force-dynamic'

// Elegibles = movimientos EGRESO cuya categoría apunta a 220501 (pago de proveedor),
// con tercero (proveedor), desde 2026-07-01, y sin pago CB contabilizado.
async function getPagos() {
  const { data: cats } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '220501')
  const catIds = (cats ?? []).map(c => c.id)
  if (catIds.length === 0) return []

  const { data: cb } = await supabase
    .from('journal_entries').select('origen_id')
    .eq('origen_tabla', 'bank_transactions').eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO')
  const conCB = new Set((cb ?? []).map(x => x.origen_id))

  const { data: bts } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, description, tercero_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona)')
    .in('category_id', catIds)
    .gte('date', '2026-07-01')
    .order('date')

  return (bts ?? [])
    .filter((b: any) => b.tercero_id && !conCB.has(b.id))
    .map((b: any) => ({
      id:          b.id,
      fecha:       b.date as string,
      monto:       Number(b.amount),
      proveedor:   b.terceros ? nombreTercero(b.terceros) : '—',
      descripcion: (b.description ?? '') as string,
    }))
}

export default async function PagoProveedoresPage() {
  const movimientos = await getPagos()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Pago a proveedores</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Movimientos bancarios que pagan un pasivo con proveedor (DB 220501 Proveedores /
          CR 11100510 Banco). Baja el saldo del proveedor causado. Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          El tercero (proveedor) sale del movimiento. Los pagos Flypass netean contra la causación
          de peaje F2X; el saldo restante es la deuda pendiente del proveedor a fin de mes.
        </p>
      </div>
      <PagoProveedoresClient movimientos={movimientos} />
    </div>
  )
}
