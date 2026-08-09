import { supabase } from '@/lib/supabase'
import { nombreTercero } from '@/lib/tercero-nombre'
import PagoProveedoresClient from './PagoProveedoresClient'

export const dynamic = 'force-dynamic'

// Cuentas 5/6 que NO van por gasto directo (tienen mecanismo propio): nómina-devengo e
// IVA asumido. Deben coincidir con los guards de postear_gasto_bancario_directo.
// 6145xx SÍ se permiten: un costo operativo pagado directo del banco (sin anticipo de
// conductor) es un gasto bancario directo; solo lo pagado con anticipo va por legalización.
const NOMINA = ['52050610', '52052710', '52053010', '52053310', '52053610', '52053910', '52056810', '52056910', '52057010', '52057210']
const excluidoGasto = (puc: string) => puc === '53152010' || NOMINA.includes(puc)

async function getMovimientos() {
  // "ya contabilizado" con el MISMO criterio que asientoContabilizadoDeTransaccion (/bancos):
  //   (a) cualquier asiento directo desde la transacción (origen_tabla='bank_transactions',
  //       CUALQUIER comprobante — no solo CB), (b) consolidado (tabla puente), (c) FE vinculada
  //       (matched_invoice_id cuyo costo se posteó desde la factura DIAN).
  const [{ data: cats }, { data: directos }, { data: consol }, { data: feCG }] = await Promise.all([
    supabase.from('transaction_categories').select('id, name, puc_code'),
    supabase.from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'bank_transactions').eq('estado', 'CONTABILIZADO'),
    supabase.from('gasto_consolidado_items').select('bank_transaction_id, journal_entries!inner(estado)')
      .eq('journal_entries.estado', 'CONTABILIZADO'),
    supabase.from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'dian_invoices_import').eq('estado', 'CONTABILIZADO'),
  ])
  const postedDirecto = new Set([
    ...(directos ?? []).map(x => x.origen_id),
    ...(consol ?? []).map((x: any) => x.bank_transaction_id),
  ])
  const postedFacturas = new Set((feCG ?? []).map(x => x.origen_id))
  const contabilizado = (b: any) =>
    postedDirecto.has(b.id) || (b.matched_invoice_id && postedFacturas.has(b.matched_invoice_id))
  const catById = new Map((cats ?? []).map((c: any) => [c.id, c]))

  // categorías por destino
  const catsPago = (cats ?? []).filter((c: any) => c.puc_code === '220501').map((c: any) => c.id)
  const catsGasto = (cats ?? []).filter((c: any) => c.puc_code && /^[56]/.test(c.puc_code) && !excluidoGasto(c.puc_code)).map((c: any) => c.id)

  const { data: bts } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, description, category_id, tercero_id, matched_invoice_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona)')
    .in('category_id', [...catsPago, ...catsGasto])
    .gte('date', '2026-07-01')
    .order('date')

  const catsPagoSet = new Set(catsPago)
  const pagos: any[] = []
  const gastos: any[] = []
  for (const b of (bts ?? []) as any[]) {
    if (contabilizado(b)) continue
    const cat = catById.get(b.category_id)
    if (catsPagoSet.has(b.category_id)) {
      if (!b.tercero_id) continue  // pago a proveedor exige tercero (proveedor)
      pagos.push({ id: b.id, fecha: b.date, monto: Number(b.amount), tercero: b.terceros ? nombreTercero(b.terceros) : '—', descripcion: b.description ?? '' })
    } else {
      gastos.push({
        id: b.id, fecha: b.date, monto: Number(b.amount),
        tercero: b.terceros ? nombreTercero(b.terceros) : 'Consumidor Final',
        descripcion: b.description ?? '',
        categoria: cat?.name ?? '—', puc: cat?.puc_code ?? '—',
      })
    }
  }
  return { pagos, gastos }
}

export default async function PagosGastosPage() {
  const { pagos, gastos } = await getMovimientos()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Pagos y gastos bancarios</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Movimientos del banco por contabilizar, en dos mecanismos distintos:
          <strong> pago a proveedor</strong> (cancela un pasivo ya causado · DB 220501 / CR banco) y
          <strong> gasto directo</strong> (reconoce el gasto en el mismo instante · DB cuenta 5/6 / CR banco).
          Nada se contabiliza sin tu confirmación.
        </p>
      </div>
      <PagoProveedoresClient pagos={pagos} gastos={gastos} />
    </div>
  )
}
