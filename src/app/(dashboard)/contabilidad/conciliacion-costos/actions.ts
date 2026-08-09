'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { resolverTerceroPorNitCrudo } from '@/lib/terceros'
import { normalizarIdentificacion } from '@/lib/nit'
import type { DianRow } from '@/lib/dian-xlsx'
import { facturasConEstado, type FeEstado } from '@/lib/facturas-estado'
import { formatCOP } from '@/lib/utils'

export type CostoResultado = { id: string; ref: string; ok: boolean; mensaje: string }

const ISADAN = '902030120'                       // ISADAN TRANSPORTES (emisor o receptor)
const ACUSE  = 'Application response'             // acuses de recibo (no son facturas ni NC)

export type DianImportResult =
  | { ok: true
      recibidas: number                                             // insertadas grupo RECIBIDO (costos)
      emitidas: number                                              // insertadas grupo EMITIDO (ventas)
      duplicados: number
      omitidos: number                                              // ni receptor ni emisor ISADAN + acuses + NC
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
  if (!rows.length) return { ok: true, recibidas: 0, emitidas: 0, duplicados: 0, omitidos: 0, tercerosNuevos: [], revisar: [] }

  // a) Clasificar cada fila del archivo ÚNICO en RECIBIDO (receptor ISADAN → costo, tercero=proveedor)
  //    o EMITIDO (emisor ISADAN → venta, tercero=cliente). FE y NC se GUARDAN ambas (el neteo de
  //    peajes F2X y el evento de nota crédito emitida las necesitan); solo se excluyen los acuses.
  type Clasif = { row: DianRow; grupo: 'RECIBIDO' | 'EMITIDO'; nitTercero: string; nombreTercero: string; rol: 'PROVEEDOR' | 'CLIENTE' }
  let omitidos = 0
  const clasificadas: Clasif[] = []
  for (const r of rows) {
    if (r.document_type === ACUSE) { omitidos++; continue }
    if (normalizarIdentificacion(r.nit_receiver) === ISADAN) {
      clasificadas.push({ row: r, grupo: 'RECIBIDO', nitTercero: r.nit_issuer, nombreTercero: r.name_issuer, rol: 'PROVEEDOR' })
    } else if (normalizarIdentificacion(r.nit_issuer) === ISADAN) {
      clasificadas.push({ row: r, grupo: 'EMITIDO', nitTercero: r.nit_receiver, nombreTercero: r.name_receiver, rol: 'CLIENTE' })
    } else { omitidos++ }
  }

  // b) dedupe por CUFE — POR LOTES. Un solo .in() con cientos de CUFEs revienta la URL (HTTP 400)
  //    y, si se ignora el error, el dedupe se salta en silencio y el insert choca con el unique de cufe.
  const cufes = clasificadas.map(c => c.row.cufe).filter((c): c is string => !!c && c.length > 0)
  const existentes = new Set<string>()
  const CHUNK = 100
  for (let i = 0; i < cufes.length; i += CHUNK) {
    const lote = cufes.slice(i, i + CHUNK)
    const { data, error } = await supabase.from('dian_invoices_import').select('cufe').in('cufe', lote)
    if (error) return { ok: false, error: `Error verificando duplicados (lote ${Math.floor(i / CHUNK) + 1}): ${error.message}` }
    for (const e of (data ?? [])) existentes.add((e as { cufe: string }).cufe)
  }
  const nuevas = clasificadas.filter(c => c.row.cufe && !existentes.has(c.row.cufe))
  const duplicados = clasificadas.length - nuevas.length

  // c) resolver tercero según dirección (proveedor por nit_issuer / cliente por nit_receiver)
  const tercerosNuevos: { nombre: string; nit: string; warning: string | null }[] = []
  const revisar: { folio: string; nombre: string; nit: string }[] = []
  const filas: Record<string, unknown>[] = []
  let recibidas = 0, emitidas = 0

  for (const c of nuevas) {
    const r = c.row
    const base = normalizarIdentificacion(c.nitTercero)
    let terceroId: string | null = null
    if (base && base.length >= 8 && base.length <= 10) {
      try {
        const res = await resolverTerceroPorNitCrudo(c.nitTercero, { nombre: c.nombreTercero, rol: c.rol })
        terceroId = res.terceroId
        if (res.created) tercerosNuevos.push({ nombre: c.nombreTercero || res.base, nit: res.base, warning: res.warning })
      } catch {
        revisar.push({ folio: r.folio, nombre: c.nombreTercero, nit: c.nitTercero })
      }
    } else {
      revisar.push({ folio: r.folio, nombre: c.nombreTercero, nit: c.nitTercero })
    }
    filas.push({
      document_type: r.document_type, cufe: r.cufe, folio: r.folio, prefix: r.prefix,
      issue_date: r.issue_date, reception_date: r.reception_date,
      nit_issuer: r.nit_issuer, name_issuer: r.name_issuer,
      nit_receiver: r.nit_receiver, name_receiver: r.name_receiver,
      iva: r.iva, total: r.total, status: r.status, tercero_id: terceroId,
      grupo: c.grupo,
    })
    if (c.grupo === 'RECIBIDO') recibidas++; else emitidas++
  }

  // d) insert (ambas direcciones en un solo pase)
  if (filas.length > 0) {
    const { error } = await supabase.from('dian_invoices_import').insert(filas)
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/contabilidad/conciliacion-costos')
  revalidatePath('/contabilidad/facturacion')
  return { ok: true, recibidas, emitidas, duplicados, omitidos, tercerosNuevos, revisar }
}

export type VincularResult = { ok: true; asiento: string } | { ok: false; error: string }

/**
 * Núcleo COMPARTIDO del pago directo FE↔banco: postea el costo (CR banco 11100510) y —solo si
 * el guard NO rechaza— enlaza matched_invoice_id en el egreso, sincroniza tercero+categoría del
 * banco con la FE (la FE es la fuente de verdad) y aprende la cuenta del proveedor. Lo llaman
 * los DOS puntos de entrada (banco→FE y conciliación→banco) con los mismos dos ids — así un fix
 * futuro no se olvida en un lado. Orden postear→enlazar: un rechazo del guard no deja link huérfano.
 */
export async function vincularFeBancoAction(
  input: { bankTxnId: string; importId: string; cuentaPuc: string },
): Promise<VincularResult> {
  if (!input.bankTxnId || !input.importId || !input.cuentaPuc) {
    return { ok: false, error: 'Faltan datos (banco, factura o cuenta de costo).' }
  }

  // Guard de monto: el asiento acredita al banco el TOTAL de la FE (no el monto del egreso). Si el
  // egreso real y el total de la FE no coinciden (±1 peso), vincular divergiría la contabilidad del
  // banco del movimiento real → se rechaza. (Pendiente a definir: caso de "pago parcial real"/descuento.)
  const [{ data: bt }, { data: feChk }] = await Promise.all([
    supabase.from('bank_transactions').select('amount').eq('id', input.bankTxnId).single(),
    supabase.from('dian_invoices_import').select('total, folio').eq('id', input.importId).single(),
  ])
  const bankAmt = Number(bt?.amount ?? 0)
  const feTotal = Number(feChk?.total ?? 0)
  if (Math.abs(bankAmt - feTotal) > 1) {
    return {
      ok: false,
      error: `El monto de este movimiento bancario (${formatCOP(bankAmt)}) no coincide con el total de la factura FE ${(feChk as { folio?: string } | null)?.folio ?? ''} (${formatCOP(feTotal)}) — verifica cuál es el correcto antes de vincular.`,
    }
  }

  // 1) postear el costo (pago directo, CR 11100510). El guard rechaza si la FE ya está causada.
  const { data: entryId, error } = await supabase.rpc('postear_costo_dian', {
    p_import_id: input.importId, p_cuenta_puc: input.cuentaPuc, p_credito_puc: '11100510',
  })
  if (error) return { ok: false, error: error.message }

  // 2) enlazar el egreso + sincronizar tercero/categoría del banco con la FE
  const { data: fe } = await supabase.from('dian_invoices_import').select('tercero_id').eq('id', input.importId).single()
  const terceroId = fe?.tercero_id ?? null
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', input.cuentaPuc).eq('active', true).maybeSingle()
  const upd: Record<string, unknown> = { matched_invoice_id: input.importId, tercero_id: terceroId }
  if (cat?.id) upd.category_id = cat.id
  await supabase.from('bank_transactions').update(upd).eq('id', input.bankTxnId)

  // 3) aprender la cuenta del proveedor si aún no la tiene (igual que la conciliación normal)
  if (terceroId) {
    const { data: t } = await supabase.from('terceros').select('cuenta_puc_sugerida').eq('id', terceroId).single()
    if (t && !t.cuenta_puc_sugerida) {
      await supabase.from('terceros').update({ cuenta_puc_sugerida: input.cuentaPuc }).eq('id', terceroId)
    }
  }

  const { data: asiento } = await supabase.from('journal_entries').select('consecutivo').eq('id', entryId as string).single()
  revalidatePath('/contabilidad/conciliacion-costos')
  revalidatePath('/bancos', 'layout')
  return { ok: true, asiento: `CG-${asiento?.consecutivo}` }
}

/** Info de la FE ya vinculada a un egreso (para mostrar el estado bloqueado en el modal de banco). */
export async function getVinculoInfoAction(
  importId: string,
): Promise<{ folio: string; emisor: string; asiento: string | null } | null> {
  const { data: fe } = await supabase
    .from('dian_invoices_import')
    .select('folio, name_issuer, terceros(razon_social)')
    .eq('id', importId).single()
  if (!fe) return null
  const { data: cg } = await supabase
    .from('journal_entries').select('consecutivo')
    .eq('origen_tabla', 'dian_invoices_import').eq('origen_id', importId)
    .eq('tipo_comprobante', 'CG').eq('estado', 'CONTABILIZADO').maybeSingle()
  const f = fe as any
  return {
    folio: String(f.folio ?? ''),
    emisor: (f.terceros?.razon_social ?? f.name_issuer ?? '—') as string,
    asiento: cg?.consecutivo ? `CG-${cg.consecutivo}` : null,
  }
}

/** FE del mes con estado (para el selector "vincular factura DIAN" del modal de banco). periodo = 'YYYY-MM'. */
export async function getFacturasVinculablesAction(periodo: string): Promise<FeEstado[]> {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m) return []
  const y = Number(m[1]), mm = Number(m[2])
  const desde = `${periodo}-01`
  const hasta = mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, '0')}-01`
  return facturasConEstado(desde, hasta)
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
