'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

const CUENTAS: Record<string, string> = {
  '23700510': 'Aportes EPS',
  '23700610': 'Aportes ARL',
  '23701010': 'Aportes Caja',
  '23803010': 'Fondo de pensión',
}

export type ResumenLinea = { cuenta: string; cuentaNombre: string; tercero: string; monto: number }
export type ResumenSS = {
  lineas: ResumenLinea[]
  causado: number
  yaConsolidado: { consecutivo: number } | null
}

/**
 * Resumen de lo que se consolidaría para un periodo: el saldo pendiente (crédito − débito)
 * de las 4 cuentas de seguridad social, agrupado por (cuenta, entidad real) — el fondo de
 * pensión queda separado por Colpensiones/Protección. Más el guard: si ese periodo ya tiene
 * una consolidación (origen_tabla='consolidacion_ss'), lo reporta para bloquear el botón.
 */
export async function getResumenSSAction(periodo: string): Promise<ResumenSS> {
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('cuenta_puc, tercero_id, tercero_nombre_snapshot, debito, credito, journal_entries(estado)')
    .in('cuenta_puc', Object.keys(CUENTAS))

  const agg = new Map<string, ResumenLinea>()
  for (const l of (lines ?? []) as unknown as Array<{ cuenta_puc: string; tercero_id: string | null; tercero_nombre_snapshot: string | null; debito: number; credito: number; journal_entries: { estado: string } | null }>) {
    if (l.journal_entries?.estado !== 'CONTABILIZADO') continue
    const key = `${l.cuenta_puc}|${l.tercero_id ?? '—'}`
    const cur = agg.get(key) ?? { cuenta: l.cuenta_puc, cuentaNombre: CUENTAS[l.cuenta_puc] ?? l.cuenta_puc, tercero: l.tercero_nombre_snapshot ?? '—', monto: 0 }
    cur.monto += Number(l.credito) - Number(l.debito)
    agg.set(key, cur)
  }
  const lineas = [...agg.values()]
    .filter(x => Math.round(x.monto) > 0)
    .map(x => ({ ...x, monto: Math.round(x.monto) }))
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta) || a.tercero.localeCompare(b.tercero))
  const causado = lineas.reduce((s, x) => s + x.monto, 0)

  const { data: cg } = await supabase
    .from('journal_entries')
    .select('consecutivo')
    .eq('origen_tabla', 'consolidacion_ss')
    .eq('periodo', periodo)
    .eq('estado', 'CONTABILIZADO')
    .order('consecutivo', { ascending: true })
    .limit(1)
    .maybeSingle()

  return { lineas, causado, yaConsolidado: cg ? { consecutivo: cg.consecutivo } : null }
}

export type EstadoPagoSS = {
  saldo: number
  candidatos: { id: string; date: string; amount: number; description: string }[]
  ultimoPago: { consecutivo: number } | null
}

/**
 * Estado del PAGO del pasivo consolidado 23709510 (a Aportes en Línea). Es un saldo
 * de cuenta ÚNICO (no separable por periodo): muestra el TOTAL pendiente con el operador,
 * aunque haya varios meses consolidados sin pagar. Candidatos = movimientos bancarios
 * categorizados "Pago seguridad social (PILA)" (puc 23709510), POST-corte y sin contabilizar
 * (los pre-corte ya están en la apertura y no deben postearse).
 */
export async function getEstadoPagoSSAction(): Promise<EstadoPagoSS> {
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debito, credito, journal_entries(estado, tipo_comprobante, consecutivo)')
    .eq('cuenta_puc', '23709510')

  let saldo = 0
  let ultimoPago: { consecutivo: number } | null = null
  for (const l of (lines ?? []) as unknown as Array<{ debito: number; credito: number; journal_entries: { estado: string; tipo_comprobante: string; consecutivo: number } | null }>) {
    if (l.journal_entries?.estado !== 'CONTABILIZADO') continue
    saldo += Number(l.credito) - Number(l.debito)
    if (Number(l.debito) > 0 && l.journal_entries.tipo_comprobante === 'CB') {
      if (!ultimoPago || l.journal_entries.consecutivo > ultimoPago.consecutivo) ultimoPago = { consecutivo: l.journal_entries.consecutivo }
    }
  }
  saldo = Math.round(saldo)

  const { data: cats } = await supabase.from('transaction_categories').select('id').eq('puc_code', '23709510')
  const catIds = (cats ?? []).map(c => c.id)
  const candidatos: EstadoPagoSS['candidatos'] = []
  if (catIds.length) {
    const { data: bts } = await supabase
      .from('bank_transactions')
      .select('id, date, amount, description')
      .in('category_id', catIds)
      .gte('date', '2026-07-01')   // post-corte: los pre-corte ya están en la apertura
      .order('date')
    for (const bt of (bts ?? [])) {
      const { data: cb } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('origen_tabla', 'bank_transactions').eq('origen_id', bt.id)
        .eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO')
        .limit(1).maybeSingle()
      if (!cb) candidatos.push({ id: bt.id as string, date: bt.date as string, amount: Number(bt.amount), description: (bt.description as string) ?? '' })
    }
  }
  return { saldo, candidatos, ultimoPago }
}

export async function postearPagoSSAction(bankTransactionId: string): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_pago_ss_banco', { p_bank_transaction_id: bankTransactionId })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/seguridad-social')
  return { ok: true, mensaje: `Pago contabilizado · asiento CB-${e?.consecutivo}` }
}

/** Contabiliza la consolidación del periodo. montoReal null → consolida al causado (ajuste 0). */
export async function postearConsolidacionSSAction(
  periodo: string,
  montoReal: number | null,
): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_consolidacion_ss_mensual', {
    p_periodo: `${periodo}-01`,
    p_monto_real: montoReal,
  })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/seguridad-social')
  return { ok: true, mensaje: `Consolidación de ${periodo} contabilizada · asiento CG-${e?.consecutivo}` }
}
