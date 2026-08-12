import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import CruceClient from './CruceClient'

export const dynamic = 'force-dynamic'

// Elegibles = AR entries no PAGADA, cuyo tercero tiene anticipo disponible en 28050510
// (CR - DB > 0) Y cartera facturada en 13050501 (DB - CR > 0), y que aún no tienen un
// cruce CX contabilizado. El monto mostrado = MIN(anticipo del tercero, cartera del
// tercero, saldo de la factura). Es un estimado: la función recalcula en firme al
// confirmar (si cruzas dos facturas del mismo tercero, la segunda toma el anticipo ya
// reducido). Cero automatismo — Isabella confirma cada cruce.
async function getElegibles() {
  const lines = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('cuenta_puc, tercero_id, debito, credito, journal_entries!inner(estado)')
    .in('cuenta_puc', ['28050510', '13050501'])
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))

  const anticipo = new Map<string, number>()
  const cartera = new Map<string, number>()
  for (const l of lines as any[]) {
    if (!l.tercero_id) continue
    const d = Number(l.debito) || 0
    const c = Number(l.credito) || 0
    if (l.cuenta_puc === '28050510') anticipo.set(l.tercero_id, (anticipo.get(l.tercero_id) ?? 0) + c - d)
    else cartera.set(l.tercero_id, (cartera.get(l.tercero_id) ?? 0) + d - c)
  }

  const cx = await fetchAll<any>((from, to) => supabase
    .from('journal_entries').select('origen_id')
    .eq('origen_tabla', 'accounts_receivable_entries')
    .eq('tipo_comprobante', 'CX').eq('estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  const cruzadas = new Set(cx.map(x => x.origen_id))

  const entries = await fetchAll<any>((from, to) => supabase
    .from('accounts_receivable_entries')
    .select('id, client_name, invoice_number, invoice_amount, advance_amount, status, tercero_id, invoice_date, terceros(razon_social)')
    .neq('status', 'PAGADA')
    // Solo julio en adelante: las facturas pre-corte ya están netas en la apertura (CA-1);
    // cruzar su anticipo/cartera duplicaría contra ese saldo histórico (mismo corte que periodo_bloqueado).
    .gte('invoice_date', '2026-07-01')
    .order('invoice_number').order('id', { ascending: true }).range(from, to))

  return entries
    .filter((e: any) =>
      e.tercero_id && !cruzadas.has(e.id)
      && (anticipo.get(e.tercero_id) ?? 0) > 0
      && (cartera.get(e.tercero_id) ?? 0) > 0)
    .map((e: any) => {
      const ant = anticipo.get(e.tercero_id) ?? 0
      const car = cartera.get(e.tercero_id) ?? 0
      const saldoFact = Number(e.invoice_amount) - Number(e.advance_amount)
      return {
        id: e.id,
        // Nombre autoritativo desde el tercero (fuente única); client_name es un snapshot
        // de texto viejo que puede traer el typo del archivo original (ver terceros-fuente-unica).
        cliente: (e.terceros?.razon_social ?? e.client_name) as string,
        factura: e.invoice_number as string,
        saldoFactura: saldoFact,
        anticipoDisp: ant,
        carteraTercero: car,
        monto: Math.min(ant, car, saldoFact),
      }
    })
    .filter(e => e.monto > 0)
}

export default async function CrucePage() {
  const elegibles = await getElegibles()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Cruce de cartera</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Facturas con cartera contabilizada cuyo cliente tiene un anticipo disponible. El cruce
          reclasifica el anticipo contra la cartera (DB 28050510 / CR 13050501) y abona la factura.
          Nada se cruza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          El monto es el menor entre el anticipo disponible del cliente, su cartera pendiente y el
          saldo de la factura. La función recalcula en firme al confirmar.
        </p>
      </div>
      <CruceClient elegibles={elegibles} />
    </div>
  )
}
