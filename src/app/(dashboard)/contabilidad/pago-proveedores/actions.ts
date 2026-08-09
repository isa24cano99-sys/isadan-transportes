'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type PagoResultado = {
  btId: string
  ref: string
  ok: boolean
  mensaje: string
}

async function postearPorRpc(
  rpc: string, movimientos: { id: string; ref: string; centroCosto?: string }[],
): Promise<PagoResultado[]> {
  const resultados: PagoResultado[] = []
  for (const m of movimientos) {
    const params: Record<string, unknown> = { p_bank_transaction_id: m.id }
    if (m.centroCosto) params.p_centro_costo = m.centroCosto
    const { data, error } = await supabase.rpc(rpc, params)
    if (error) {
      resultados.push({ btId: m.id, ref: m.ref, ok: false, mensaje: error.message })
    } else {
      const { data: asiento } = await supabase
        .from('journal_entries').select('consecutivo').eq('id', data as string).single()
      resultados.push({ btId: m.id, ref: m.ref, ok: true, mensaje: `Contabilizado · asiento CB-${asiento?.consecutivo}` })
    }
  }
  revalidatePath('/contabilidad/pago-proveedores')
  return resultados
}

/**
 * Pago a proveedor (DB 220501 / CR 11100510). Baja el pasivo ya causado.
 * postear_pago_proveedor_banco valida categoría (220501), tercero, pre-corte, anti-dup.
 */
export async function postearPagoProveedorAction(
  movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  return postearPorRpc('postear_pago_proveedor_banco', movimientos)
}

/**
 * Gasto directo (DB cuenta 5/6 de la categoría / CR 11100510). Reconoce el gasto en el
 * instante. postear_gasto_bancario_directo valida clase 5/6, no-nómina/IVA, pre-corte,
 * anti-dup (individual o dentro de un grupo), y usa Consumidor Final si no hay tercero.
 */
export async function postearGastoDirectoAction(
  movimientos: { id: string; ref: string; centroCosto?: string }[],
): Promise<PagoResultado[]> {
  return postearPorRpc('postear_gasto_bancario_directo', movimientos)
}

/**
 * Transferencia interna banco ↔ caja (DB/CR 110505 vs 11100510 según la dirección del
 * movimiento). postear_transferencia_interna valida categoría (→110505), monto, pre-corte,
 * anti-dup, y decide la dirección por el type de la transacción (EGRESO/INGRESO).
 */
export async function postearTransferenciaInternaAction(
  movimientos: { id: string; ref: string }[],
): Promise<PagoResultado[]> {
  return postearPorRpc('postear_transferencia_interna', movimientos)
}

/**
 * Consolida ≥2 gastos directos en UN solo asiento (patrón Dataico): una línea de débito
 * por transacción (a su cuenta/tercero) + una de crédito al banco por el total, bajo la
 * descripción que escribe el usuario. postear_gastos_consolidados valida cada bt y exige
 * que todas sean del mismo mes que la fecha del asiento.
 */
export async function postearGastosConsolidadosAction(
  btIds: string[], descripcion: string, fecha: string,
): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_gastos_consolidados', {
    p_bt_ids: btIds, p_descripcion: descripcion, p_fecha: fecha,
  })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/pago-proveedores')
  return { ok: true, mensaje: `Consolidado en 1 asiento CB-${e?.consecutivo} · ${btIds.length} gastos` }
}
