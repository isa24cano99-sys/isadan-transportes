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
