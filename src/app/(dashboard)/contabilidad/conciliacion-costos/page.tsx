import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { facturasConEstado } from '@/lib/facturas-estado'
import Link from 'next/link'
import ConciliacionCostosClient, { type ItemCosto, type CuentaCosto, type EgresoBanco, type FacturaAnulada } from './ConciliacionCostosClient'

export const dynamic = 'force-dynamic'

const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const mesLabel = (p: string) => { const [y, m] = p.split('-'); return `${MESES[Number(m)]} ${y}` }
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

// Meses con facturas RECIBIDO reales (para los botones); cada mes con datos tiene el suyo.
async function getMesesDisponibles(): Promise<string[]> {
  const rows = await fetchAll<any>((from, to) => supabase
    .from('dian_invoices_import').select('issue_date').eq('grupo', 'RECIBIDO')
    .not('issue_date', 'is', null).order('issue_date', { ascending: true }).range(from, to))
  const set = new Set<string>()
  for (const r of rows) if (r.issue_date) set.add((r.issue_date as string).slice(0, 7))
  return [...set].sort()
}

// Antes fijo a julio ('2026-07-01'..'2026-08-01'); ahora [inicio, fin) del mes elegido, tanto para
// las FE como para la ventana de banco del pre-sugerido de pago (±7 días, que es la tolerancia de days()).
async function getData(periodo: string) {
  const { data: cuentas } = await supabase
    .from('puc_accounts').select('codigo, nombre').like('codigo', '6145%').eq('active', true).order('codigo')

  const inicio = `${periodo}-01`
  const [y, m] = periodo.split('-').map(Number)
  const fin = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const bankDesde = shift(inicio, -7), bankHasta = shift(fin, 7)

  const base = await facturasConEstado(inicio, fin)
  const bank = await fetchAll<any>((from, to) => supabase
    .from('bank_transactions').select('id, date, amount, description')
    .eq('type', 'EGRESO').gte('date', bankDesde).lt('date', bankHasta).order('date').order('id', { ascending: true }).range(from, to))

  const egresos: EgresoBanco[] = bank.map((b: any) => ({
    id: b.id, date: b.date, amount: Number(b.amount), description: (b.description ?? '') as string,
  }))

  const items: ItemCosto[] = base.map(v => {
    const amt = Math.round(v.monto)
    const pagado = egresos.some(b => Math.round(b.amount) === amt && days(b.date, v.fecha) <= 7)
    return { ...v, tratamiento: (pagado ? 'a' : 'c') as 'a' | 'c' }
  })

  // Facturas marcadas como anuladas por NC (fuera de candidatas) — para poder verlas/restaurarlas.
  const { data: anulRows } = await supabase
    .from('dian_invoices_import')
    .select('id, folio, issue_date, name_issuer, total, terceros(razon_social)')
    .eq('grupo', 'RECIBIDO').eq('anulada_nc', true)
    .gte('issue_date', inicio).lt('issue_date', fin)
    .order('issue_date')
  const anuladas: FacturaAnulada[] = (anulRows ?? []).map((v: any) => ({
    id: v.id, folio: String(v.folio), fecha: v.issue_date as string,
    emisor: (v.terceros?.razon_social ?? v.name_issuer ?? '—') as string, monto: Number(v.total),
  }))

  return { items, cuentas: (cuentas ?? []) as CuentaCosto[], egresos, anuladas }
}

export default async function ConciliacionCostosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [meses, sp] = await Promise.all([getMesesDisponibles(), searchParams])
  const defecto = meses[meses.length - 1] ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const sel = sp.periodo && meses.includes(sp.periodo) ? sp.periodo : defecto
  const { items, cuentas, egresos, anuladas } = await getData(sel)

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

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {meses.map(p => (
          <Link key={p} href={`/contabilidad/conciliacion-costos?periodo=${p}`}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {mesLabel(p)}
          </Link>
        ))}
      </div>

      <ConciliacionCostosClient items={items} cuentas={cuentas} egresos={egresos} anuladas={anuladas} />
    </div>
  )
}
