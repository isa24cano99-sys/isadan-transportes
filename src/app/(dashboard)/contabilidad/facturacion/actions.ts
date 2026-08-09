'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

const FE = 'Factura electrónica'
const NC = 'Nota de crédito electrónica'

export type EmitidaFE = {
  id: string; folio: string; prefix: string; issue_date: string | null
  cliente: string; total: number; status: string
}
export type NotaCreditoFE = {
  id: string; folio: string; prefix: string; issue_date: string | null
  cliente: string; total: number; status: string
  feRelacionadaId: string | null; feRelacionadaFolio: string | null
  asiento: string | null
}

/** Facturas EMITIDAS (grupo='EMITIDO', tipo FE) ya importadas — consulta pura. */
export async function getEmitidasAction(): Promise<EmitidaFE[]> {
  const { data } = await supabase
    .from('dian_invoices_import')
    .select('id, folio, prefix, issue_date, name_receiver, total, status, terceros(razon_social)')
    .eq('grupo', 'EMITIDO').eq('document_type', FE)
    .order('issue_date', { ascending: false })
  return (data ?? []).map(mapRow)
}

/** Notas crédito EMITIDAS (grupo='EMITIDO', tipo NC) — con su enlace a la FE y si ya está posteada. */
export async function getNotasCreditoEmitidasAction(): Promise<NotaCreditoFE[]> {
  const { data } = await supabase
    .from('dian_invoices_import')
    .select('id, folio, prefix, issue_date, name_receiver, total, status, fe_relacionada_id, terceros(razon_social)')
    .eq('grupo', 'EMITIDO').eq('document_type', NC)
    .order('issue_date', { ascending: false })
  const ncs = data ?? []

  // folio de la FE relacionada + asiento contabilizado de cada NC
  const feIds = [...new Set(ncs.map((n: { fe_relacionada_id: string | null }) => n.fe_relacionada_id).filter(Boolean))] as string[]
  const feFolios = new Map<string, string>()
  if (feIds.length) {
    const { data: fes } = await supabase.from('dian_invoices_import').select('id, folio, prefix').in('id', feIds)
    for (const f of (fes ?? []) as Array<{ id: string; folio: string | null; prefix: string | null }>) feFolios.set(f.id, `${f.prefix ?? ''}${f.folio ?? ''}`)
  }
  const { data: asientos } = await supabase.from('journal_entries')
    .select('origen_id, consecutivo').eq('origen_tabla', 'dian_invoices_import').eq('tipo_comprobante', 'NC').eq('estado', 'CONTABILIZADO')
  const asientoDe = new Map((asientos ?? []).map((a: { origen_id: string; consecutivo: number }) => [a.origen_id, `NC-${a.consecutivo}`]))

  return ncs.map((r: unknown) => {
    const base = mapRow(r)
    const x = r as { fe_relacionada_id: string | null }
    return {
      ...base,
      feRelacionadaId: x.fe_relacionada_id,
      feRelacionadaFolio: x.fe_relacionada_id ? (feFolios.get(x.fe_relacionada_id) ?? null) : null,
      asiento: asientoDe.get(base.id) ?? null,
    }
  })
}

/** Enlace MANUAL: la NC corrige esta FE (el usuario lo confirma viendo la evidencia). */
export async function enlazarNotaCreditoAction(ncId: string, feId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('dian_invoices_import').update({ fe_relacionada_id: feId }).eq('id', ncId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/contabilidad/facturacion')
  return { ok: true }
}

/** Contabiliza la NC emitida (DB 41450510 / CR 13050501) vía la función con sus guards. */
export async function postearNotaCreditoAction(ncId: string): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_nota_credito_emitida', { p_import_id: ncId })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/facturacion')
  return { ok: true, mensaje: `Nota crédito contabilizada · asiento NC-${e?.consecutivo}` }
}

function mapRow(r: unknown): EmitidaFE {
  const x = r as { id: string; folio: string | null; prefix: string | null; issue_date: string | null; name_receiver: string | null; total: number; status: string | null; terceros: { razon_social: string | null } | null }
  return {
    id: x.id, folio: x.folio ?? '', prefix: x.prefix ?? '', issue_date: x.issue_date,
    cliente: x.terceros?.razon_social ?? x.name_receiver ?? '—', total: Number(x.total), status: x.status ?? '',
  }
}
