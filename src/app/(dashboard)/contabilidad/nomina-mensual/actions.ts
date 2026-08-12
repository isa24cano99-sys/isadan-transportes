'use server'

import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { revalidatePath } from 'next/cache'

export type NominaResultado = { ok: boolean; mensaje: string }

export type NominaInput = {
  conductorTerceroId: string
  driverName: string
  year: number
  month: number            // 1-12
  fondoTerceroId: string
  sueldo: number
  auxilio: number
  cesantias: number
  intereses: number
  prima: number
  vacaciones: number
  aporteArl: number
  aporteCaja: number
}

/**
 * Contabiliza (evento 8) UNA nómina mensual con los montos que Isabella digitó.
 * EPS y pensión ya NO se digitan: la función deriva el 4% empleado (EPS y pensión) y el 12%
 * patronal de pensión desde el Sueldo (IBC); EPS patronal = $0 (exoneración SIMPLE, regla fija).
 * Solo se pasan sueldo/auxilio, provisiones y los aportes 100% patronales (ARL, caja) + el fondo.
 * La función valida pre-corte + anti-duplicado por (conductor, mes). Periodo = último día del mes.
 */
export type PagoNominaConductor = {
  terceroId: string
  nombre: string
  saldo: number
  candidatos: { id: string; date: string; amount: number; description: string }[]
}

/**
 * Estado del PAGO del neto (250505) por conductor: su saldo pendiente + los movimientos
 * bancarios categorizados "Pago nómina conductor" (puc 250505), post-corte y sin contabilizar,
 * de ese conductor. Los pre-corte se excluyen (ya en la apertura). Soporta parciales (varios
 * movimientos por conductor). Un saldo NEGATIVO = se le pagó de más (se le debe al conductor).
 */
export async function getEstadoPagoNominaAction(): Promise<PagoNominaConductor[]> {
  const { data: drivers } = await supabase
    .from('drivers').select('tercero_id, full_name').eq('active', true).not('tercero_id', 'is', null).order('full_name')

  const lines = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines').select('tercero_id, debito, credito, journal_entries(estado)').eq('cuenta_puc', '250505')
    .order('id', { ascending: true }).range(from, to))
  const saldoBy = new Map<string, number>()
  for (const l of lines as unknown as Array<{ tercero_id: string | null; debito: number; credito: number; journal_entries: { estado: string } | null }>) {
    if (l.journal_entries?.estado !== 'CONTABILIZADO' || !l.tercero_id) continue
    saldoBy.set(l.tercero_id, (saldoBy.get(l.tercero_id) ?? 0) + Number(l.credito) - Number(l.debito))
  }

  const { data: cats } = await supabase.from('transaction_categories').select('id').eq('puc_code', '250505')
  const catIds = (cats ?? []).map(c => c.id)
  const candBy = new Map<string, PagoNominaConductor['candidatos']>()
  if (catIds.length) {
    const bts = await fetchAll<any>((from, to) => supabase
      .from('bank_transactions').select('id, date, amount, description, tercero_id')
      .in('category_id', catIds).gte('date', '2026-07-01').order('date').order('id', { ascending: true }).range(from, to))
    for (const bt of bts as unknown as Array<{ id: string; date: string; amount: number; description: string | null; tercero_id: string | null }>) {
      if (!bt.tercero_id) continue
      const { data: cb } = await supabase
        .from('journal_entries').select('id')
        .eq('origen_tabla', 'bank_transactions').eq('origen_id', bt.id)
        .eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO').limit(1).maybeSingle()
      if (!cb) {
        const arr = candBy.get(bt.tercero_id) ?? []
        arr.push({ id: bt.id, date: bt.date, amount: Number(bt.amount), description: bt.description ?? '' })
        candBy.set(bt.tercero_id, arr)
      }
    }
  }

  return (drivers ?? []).map(d => ({
    terceroId: d.tercero_id as string,
    nombre: d.full_name as string,
    saldo: Math.round(saldoBy.get(d.tercero_id as string) ?? 0),
    candidatos: candBy.get(d.tercero_id as string) ?? [],
  }))
}

/** Contabiliza el pago del neto de nómina (DB 250505·conductor / CR banco) vía la función genérica. */
export async function postearPagoNominaAction(bankTransactionId: string): Promise<NominaResultado> {
  const { data, error } = await supabase.rpc('postear_pago_pasivo_banco', { p_bank_transaction_id: bankTransactionId })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/nomina-mensual')
  return { ok: true, mensaje: `Pago de neto contabilizado · asiento CB-${e?.consecutivo}` }
}

export async function postearNominaAction(input: NominaInput): Promise<NominaResultado> {
  const { year, month } = input
  const lastDay = new Date(year, month, 0).getDate()
  const periodo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase.rpc('postear_nomina_mensual', {
    p_conductor:           input.conductorTerceroId,
    p_periodo:             periodo,
    p_sueldo:              input.sueldo,
    p_auxilio:             input.auxilio,
    p_cesantias:           input.cesantias,
    p_intereses_cesantias: input.intereses,
    p_prima:               input.prima,
    p_vacaciones:          input.vacaciones,
    p_aporte_arp:          input.aporteArl,
    p_aporte_caja:         input.aporteCaja,
    p_tercero_fondo:       input.fondoTerceroId || null,
  })

  if (error) return { ok: false, mensaje: error.message }

  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/nomina-mensual')
  return { ok: true, mensaje: `Nómina de ${input.driverName} (${periodo}) contabilizada · asiento CN-${asiento?.consecutivo}` }
}
