'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { resolverTerceroPorNitCrudo } from '@/lib/terceros'
import { normalizarIdentificacion } from '@/lib/nit'
import type { DianRow } from '@/lib/dian-xlsx'

export type CostoResultado = { id: string; ref: string; ok: boolean; mensaje: string }

const ISADAN = '902030120'                       // receptor: ISADAN TRANSPORTES
const ACUSE  = 'Application response'             // acuses de recibo (no son facturas)
const NC     = 'Nota de crédito electrónica'      // fuera de alcance por ahora (pieza propia)

export type DianImportResult =
  | { ok: true
      insertados: number
      duplicados: number
      omitidos: number                                              // no-receptor-ISADAN + acuses + NC
      tercerosNuevos: { nombre: string; nit: string; warning: string | null }[]
      revisar: { folio: string; nombre: string; nit: string }[] }   // NIT no reconocido → sin tercero
  | { ok: false; error: string }

/**
 * Importa el reporte DIAN desde conciliación-costos. Sobre las filas ya parseadas (mapDian):
 *   a) filtra a RECIBIDO (nit_receiver = ISADAN, normalizado — no por nombre);
 *   b) excluye acuses y notas crédito;
 *   c) dedupe por CUFE contra dian_invoices_import;
 *   d) resuelve tercero_id por nit_issuer (resolverTerceroPorNitCrudo, rol PROVEEDOR — crea
 *      JURIDICA/DV-calculado si no existe, como los emisores de FE);
 *   e) si el NIT no calza formato (largo raro / falla) NO adivina: inserta la FE con
 *      tercero_id NULL y la reporta para revisión manual;
 *   f) inserta las nuevas con su tercero_id.
 */
export async function importarDianConciliacionAction(rows: DianRow[]): Promise<DianImportResult> {
  if (!rows.length) return { ok: true, insertados: 0, duplicados: 0, omitidos: 0, tercerosNuevos: [], revisar: [] }

  // a) receptor ISADAN  +  b) excluir acuses / NC
  let omitidos = 0
  const recibidas = rows.filter(r => {
    if (normalizarIdentificacion(r.nit_receiver) !== ISADAN) { omitidos++; return false }
    if (r.document_type === ACUSE || r.document_type === NC)  { omitidos++; return false }
    return true
  })

  // c) dedupe por CUFE
  const cufes = recibidas.map(r => r.cufe).filter(c => c?.length > 0)
  let existentes = new Set<string>()
  if (cufes.length > 0) {
    const { data } = await supabase.from('dian_invoices_import').select('cufe').in('cufe', cufes)
    existentes = new Set((data ?? []).map((e: { cufe: string }) => e.cufe))
  }
  const nuevas = recibidas.filter(r => r.cufe && !existentes.has(r.cufe))
  const duplicados = recibidas.length - nuevas.length

  // d/e) resolver tercero por NIT (o marcar para revisión si el formato no calza)
  const tercerosNuevos: { nombre: string; nit: string; warning: string | null }[] = []
  const revisar: { folio: string; nombre: string; nit: string }[] = []
  const filas: Record<string, unknown>[] = []

  for (const r of nuevas) {
    const base = normalizarIdentificacion(r.nit_issuer)
    let terceroId: string | null = null
    if (base && base.length >= 8 && base.length <= 10) {
      try {
        const res = await resolverTerceroPorNitCrudo(r.nit_issuer, { nombre: r.name_issuer, rol: 'PROVEEDOR' })
        terceroId = res.terceroId
        if (res.created) tercerosNuevos.push({ nombre: r.name_issuer || res.base, nit: res.base, warning: res.warning })
      } catch {
        revisar.push({ folio: r.folio, nombre: r.name_issuer, nit: r.nit_issuer })
      }
    } else {
      revisar.push({ folio: r.folio, nombre: r.name_issuer, nit: r.nit_issuer })
    }
    filas.push({
      document_type: r.document_type, cufe: r.cufe, folio: r.folio, prefix: r.prefix,
      issue_date: r.issue_date, reception_date: r.reception_date,
      nit_issuer: r.nit_issuer, name_issuer: r.name_issuer,
      nit_receiver: r.nit_receiver, name_receiver: r.name_receiver,
      iva: r.iva, total: r.total, status: r.status, tercero_id: terceroId,
    })
  }

  // f) insert
  if (filas.length > 0) {
    const { error } = await supabase.from('dian_invoices_import').insert(filas)
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/contabilidad/conciliacion-costos')
  return { ok: true, insertados: filas.length, duplicados, omitidos, tercerosNuevos, revisar }
}

/**
 * Contabiliza el costo de una factura DIAN de proveedor contra la cuenta elegida.
 *   tratamiento 'a' (pago directo) → crédito 11100510 Banco.
 *   tratamiento 'c' (causación)    → crédito 220501 Proveedores.
 * Y APRENDE: si el tercero del proveedor aún no tiene cuenta_puc_sugerida, guarda la
 * cuenta elegida — así la próxima factura del mismo proveedor viene pre-sugerida
 * (mostrada, editable, no forzada). Si ya tenía una, NO la sobrescribe (se corrige en /terceros).
 */
export async function postearCostoDianAction(
  input: { importId: string; terceroId: string | null; cuentaPuc: string; tratamiento: 'a' | 'c'; ref: string },
): Promise<CostoResultado> {
  const credito = input.tratamiento === 'a' ? '11100510' : '220501'
  const { data, error } = await supabase.rpc('postear_costo_dian', {
    p_import_id: input.importId,
    p_cuenta_puc: input.cuentaPuc,
    p_credito_puc: credito,
  })
  if (error) return { id: input.importId, ref: input.ref, ok: false, mensaje: error.message }

  // Aprender: fijar cuenta_puc_sugerida del proveedor si aún está en NULL
  if (input.terceroId) {
    const { data: t } = await supabase
      .from('terceros').select('cuenta_puc_sugerida').eq('id', input.terceroId).single()
    if (t && !t.cuenta_puc_sugerida) {
      await supabase.from('terceros').update({ cuenta_puc_sugerida: input.cuentaPuc }).eq('id', input.terceroId)
    }
  }

  const { data: asiento } = await supabase
    .from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/conciliacion-costos')
  return { id: input.importId, ref: input.ref, ok: true, mensaje: `Contabilizado · asiento CG-${asiento?.consecutivo}` }
}
