import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import ImpuestoClient from './ImpuestoClient'

export type TaxPayment = {
  id: string
  year: number
  bimestre: number
  income: number
  rst_gross: number
  pension_contribution: number
  ica: number
  rst_net: number
  total_to_pay: number
  paid: boolean
  paid_date: string | null
  notes: string | null
  created_at: string
}

export type ReservaPendiente = {
  id: string
  fecha: string
  monto: number
  socio: string
  descripcion: string
}

export type ReservaVigente = {
  terceroId: string
  socio: string
  reservado: number
}

// Datos de las 2 secciones de "Reserva para impuestos (custodia socio)".
// - Pendientes: movimientos de banco categorizados 13251005 sin asiento CB aún.
// - Vigentes: saldo de 13251005 por socio (DB-CR, contabilizado) > 0.
// - saldo241215: impuesto causado disponible para cerrar contra (CR-DB, contabilizado).
async function getReservaData(): Promise<{
  pendientes: ReservaPendiente[]
  vigentes: ReservaVigente[]
  saldo241215: number
}> {
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '13251005').limit(1).maybeSingle()

  // Pendientes de contabilizar
  let pendientes: ReservaPendiente[] = []
  if (cat) {
    const { data: cb } = await supabase
      .from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'bank_transactions').eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO')
    const conCB = new Set((cb ?? []).map(x => x.origen_id))

    const bts = await fetchAll<any>((from, to) => supabase
      .from('bank_transactions')
      .select('id, date, amount, description, tercero_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona)')
      .eq('category_id', cat.id)
      .gte('date', '2026-07-01')
      .order('date').order('id', { ascending: true }).range(from, to))

    pendientes = bts
      .filter((b: any) => !conCB.has(b.id))
      .map((b: any) => ({
        id:          b.id,
        fecha:       b.date as string,
        monto:       Number(b.amount),
        socio:       b.terceros ? nombreTercero(b.terceros) : '— sin socio —',
        descripcion: (b.description ?? '') as string,
      }))
  }

  // Reservas vigentes por socio (saldo 13251005 débito, contabilizado)
  const lineasReserva = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('debito, credito, tercero_id, tercero_nombre_snapshot, journal_entries!inner(estado)')
    .eq('cuenta_puc', '13251005')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .range(from, to))

  const porSocio = new Map<string, { socio: string; reservado: number }>()
  for (const l of lineasReserva) {
    if (!l.tercero_id) continue
    const prev = porSocio.get(l.tercero_id) ?? { socio: l.tercero_nombre_snapshot ?? '—', reservado: 0 }
    prev.reservado += Number(l.debito ?? 0) - Number(l.credito ?? 0)
    porSocio.set(l.tercero_id, prev)
  }
  const vigentes: ReservaVigente[] = [...porSocio.entries()]
    .map(([terceroId, v]) => ({ terceroId, socio: v.socio, reservado: v.reservado }))
    .filter(v => v.reservado > 0)
    .sort((a, b) => b.reservado - a.reservado)

  // Saldo causado en 241215 (crédito, contabilizado)
  const lineas241215 = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('debito, credito, journal_entries!inner(estado)')
    .eq('cuenta_puc', '241215')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .range(from, to))
  const saldo241215 = lineas241215.reduce(
    (s: number, l: any) => s + Number(l.credito ?? 0) - Number(l.debito ?? 0), 0)

  return { pendientes, vigentes, saldo241215 }
}

export default async function ImpuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()

  const [invoiceRows, ssRes, taxRes, reserva] = await Promise.all([
    fetchAll<any>((f, t) => supabase
      .from('invoices')
      .select('issue_date, total_amount')
      .eq('invoice_type', 'EMITIDA')
      .gte('issue_date', `${year}-01-01`)
      .lte('issue_date', `${year}-12-31`)
      .order('id', { ascending: true }).range(f, t)),
    supabase
      .from('payroll_social_security')
      .select('month, pension')
      .eq('year', year),
    supabase
      .from('tax_payments')
      .select('*')
      .eq('year', year)
      .order('bimestre'),
    getReservaData(),
  ])

  const invoices    = invoiceRows
  const ssRows      = ssRes.data       ?? []
  const taxPayments = (taxRes.data     ?? []) as TaxPayment[]

  // Income from invoices (EMITIDA) grouped by bimestre (0-5)
  const incomeByBimestre: number[] = [0, 0, 0, 0, 0, 0]
  for (const inv of invoices) {
    if (!inv.issue_date) continue
    const month  = new Date((inv.issue_date as string) + 'T00:00:00').getMonth() + 1
    const bimIdx = Math.ceil(month / 2) - 1
    incomeByBimestre[bimIdx] += Number(inv.total_amount ?? 0)
  }

  // Pension empresa from payroll_social_security grouped by bimestre
  const pensionByBimestre: number[] = [0, 0, 0, 0, 0, 0]
  const hasSsData: boolean[]        = [false, false, false, false, false, false]
  for (const row of ssRows) {
    if (!row.month) continue
    const bimIdx = Math.ceil(row.month / 2) - 1
    pensionByBimestre[bimIdx] += Number(row.pension ?? 0)
    hasSsData[bimIdx] = true
  }

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6">
      <ImpuestoClient
        year={year}
        availableYears={availableYears}
        incomeByBimestre={incomeByBimestre}
        pensionByBimestre={pensionByBimestre}
        hasSsData={hasSsData}
        taxPayments={taxPayments}
        reservasPendientes={reserva.pendientes}
        reservasVigentes={reserva.vigentes}
        saldo241215={reserva.saldo241215}
      />
    </div>
  )
}
