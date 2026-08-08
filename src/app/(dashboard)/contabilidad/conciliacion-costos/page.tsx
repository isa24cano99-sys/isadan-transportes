import { supabase } from '@/lib/supabase'
import { facturasConEstado } from '@/lib/facturas-estado'
import ConciliacionCostosClient, { type ItemCosto, type CuentaCosto, type EgresoBanco } from './ConciliacionCostosClient'

export const dynamic = 'force-dynamic'

const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)

// Vista de estado (100% de las FE no-F2X del mes) + pre-sugerencia de tratamiento: 'a' (pago
// directo) si hay un EGRESO del mismo monto ±7d, si no 'c' (causación). El estado lo calcula
// el lib compartido facturasConEstado (misma fuente que el selector de banco).
async function getData() {
  const { data: cuentas } = await supabase
    .from('puc_accounts').select('codigo, nombre').like('codigo', '6145%').eq('active', true).order('codigo')

  const base = await facturasConEstado('2026-07-01', '2026-08-01')

  const { data: bank } = await supabase
    .from('bank_transactions').select('id, date, amount, description')
    .eq('type', 'EGRESO').gte('date', '2026-06-25').lt('date', '2026-08-05').order('date')

  const egresos: EgresoBanco[] = (bank ?? []).map((b: any) => ({
    id: b.id, date: b.date, amount: Number(b.amount), description: (b.description ?? '') as string,
  }))

  const items: ItemCosto[] = base.map(v => {
    const amt = Math.round(v.monto)
    const pagado = egresos.some(b => Math.round(b.amount) === amt && days(b.date, v.fecha) <= 7)
    return { ...v, tratamiento: (pagado ? 'a' : 'c') as 'a' | 'c' }
  })

  return { items, cuentas: (cuentas ?? []) as CuentaCosto[], egresos }
}

export default async function ConciliacionCostosPage() {
  const { items, cuentas, egresos } = await getData()
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Conciliación de costos (proveedores DIAN)</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Todas las facturas de otros emisores DIAN (no F2X) del mes, con su estado: asignada a
          legalización, a un pago de banco, ya contabilizada, o sin asignar. Las sin asignar se
          contabilizan aquí (elige cuenta y tratamiento); nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Tratamiento: <strong>Pago directo</strong> (DB costo / CR banco) si ya se pagó por PSE; <strong>Causación</strong>
          {' '}(DB costo / CR proveedor) si queda por pagar. La cuenta elegida por primera vez se fija como sugerencia del proveedor.
        </p>
      </div>
      <ConciliacionCostosClient items={items} cuentas={cuentas} egresos={egresos} />
    </div>
  )
}
