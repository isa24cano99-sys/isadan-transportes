import { supabase } from '@/lib/supabase'
import ConciliacionCostosClient, { type ItemCosto, type CuentaCosto } from './ConciliacionCostosClient'

export const dynamic = 'force-dynamic'

const F2X = '900219834'
const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)

// Facturas de otros emisores DIAN (no F2X) de julio, sin costo contabilizado. Se clasifican:
//   pre-sugerido tratamiento 'a' (pago directo) si hay un EGRESO bancario del mismo monto ±7d,
//   si no 'c' (causación). La cuenta de costo la hereda del proveedor (cuenta_puc_sugerida) o
//   se elige (y se aprende al primer uso). Ambos editables — nada forzado.
async function getData() {
  const { data: cuentas } = await supabase
    .from('puc_accounts').select('codigo, nombre').like('codigo', '6145%').eq('active', true).order('codigo')

  const { data: inv } = await supabase
    .from('dian_invoices_import')
    .select('id, folio, issue_date, name_issuer, total, tercero_id, terceros(razon_social, cuenta_puc_sugerida)')
    .neq('nit_issuer', F2X)
    .gte('issue_date', '2026-07-01').lt('issue_date', '2026-08-01')
    .neq('document_type', 'Application response')
    .order('issue_date')

  // Estado de cada FE (2 ejes): asignación (legalización / banco / contabilizada directa /
  // sin asignar) + clasificación (cuenta_puc_sugerida). La vista muestra el 100% de las FE.
  const [{ data: cg }, { data: le }, { data: bt }, { data: bank }] = await Promise.all([
    supabase.from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'dian_invoices_import').eq('tipo_comprobante', 'CG').eq('estado', 'CONTABILIZADO'),
    supabase.from('legalization_expenses').select('matched_invoice_id, legalizations(trips(manifest_number))')
      .not('matched_invoice_id', 'is', null),
    supabase.from('bank_transactions').select('matched_invoice_id, date').not('matched_invoice_id', 'is', null),
    supabase.from('bank_transactions').select('date, amount')
      .eq('type', 'EGRESO').gte('date', '2026-06-25').lt('date', '2026-08-05'),
  ])
  const posted = new Set((cg ?? []).map((x: any) => x.origen_id))
  const legMap = new Map(
    (le ?? []).filter((x: any) => x.matched_invoice_id)
      .map((x: any) => [x.matched_invoice_id, (x.legalizations?.trips?.manifest_number ?? null) as string | null]))
  const bankMap = new Map((bt ?? []).map((x: any) => [x.matched_invoice_id, x.date as string]))

  const items: ItemCosto[] = (inv ?? []).map((v: any) => {
    const monto = Number(v.total)
    const amt = Math.round(monto)
    const pagado = (bank ?? []).some((b: any) => Math.round(Number(b.amount)) === amt && days(b.date, v.issue_date) <= 7)
    const ter = v.terceros

    let estado: ItemCosto['estado'] = 'sin_asignar'
    let etiqueta: string | null = null
    if (posted.has(v.id)) { estado = 'contabilizada' }
    else if (legMap.has(v.id)) { estado = 'legalizacion'; etiqueta = legMap.get(v.id) ?? null }
    else if (bankMap.has(v.id)) { estado = 'banco'; etiqueta = bankMap.get(v.id) ?? null }

    return {
      id: v.id,
      emisor: (ter?.razon_social ?? v.name_issuer ?? '—') as string,
      folio: String(v.folio),
      fecha: v.issue_date as string,
      monto,
      terceroId: (v.tercero_id ?? null) as string | null,
      cuentaSugerida: (ter?.cuenta_puc_sugerida ?? null) as string | null,
      tratamiento: (pagado ? 'a' : 'c') as 'a' | 'c',
      estado,
      etiqueta,
    }
  })

  return { items, cuentas: (cuentas ?? []) as CuentaCosto[] }
}

export default async function ConciliacionCostosPage() {
  const { items, cuentas } = await getData()
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
      <ConciliacionCostosClient items={items} cuentas={cuentas} />
    </div>
  )
}
