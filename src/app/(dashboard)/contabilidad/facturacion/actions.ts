'use server'

import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { revalidatePath } from 'next/cache'
import { nombreTercero } from '@/lib/tercero-nombre'

const FE = 'Factura electrónica'
const NC = 'Nota de crédito electrónica'

export type EmitidaFE = {
  id: string; folio: string; prefix: string; issue_date: string | null
  cliente: string; terceroId: string | null; total: number; status: string
  viaje: string | null; viajeId: string | null; viajeAuto: boolean; matchedTripId: string | null
  asiento: string | null
}
export type ViajeOption = { id: string; tripNumber: string; cliente: string; freight: number; terceroId: string | null }
export type NotaCreditoFE = {
  id: string; folio: string; prefix: string; issue_date: string | null
  cliente: string; total: number; status: string
  feRelacionadaId: string | null; feRelacionadaFolio: string | null; asiento: string | null
}

async function asientosPorImport(tipo: string): Promise<Map<string, string>> {
  const data = await fetchAll<any>((from, to) => supabase.from('journal_entries')
    .select('origen_id, consecutivo').eq('origen_tabla', 'dian_invoices_import').eq('tipo_comprobante', tipo).eq('estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  return new Map(data.map((a: { origen_id: string; consecutivo: number }) => [a.origen_id, `${tipo}-${a.consecutivo}`]))
}

/** FEIT emitidas (grupo='EMITIDO', tipo FE): con viaje sugerido (manual → o por folio) y estado. */
export async function getEmitidasAction(): Promise<EmitidaFE[]> {
  const data = await fetchAll<any>((from, to) => supabase
    .from('dian_invoices_import')
    .select('id, folio, prefix, issue_date, name_receiver, total, status, tercero_id, matched_trip_id, terceros(razon_social)')
    .eq('grupo', 'EMITIDO').eq('document_type', FE)
    .order('issue_date', { ascending: false }).order('id', { ascending: true }).range(from, to))
  const rows = data as Array<Record<string, unknown>>

  // folio → viaje (por invoices.invoice_number)
  const inv = await fetchAll<any>((from, to) => supabase.from('invoices').select('invoice_number, trip_id').not('trip_id', 'is', null).order('id', { ascending: true }).range(from, to))
  const tripPorFolio = new Map<string, string>()
  for (const i of inv as Array<{ invoice_number: string; trip_id: string }>) tripPorFolio.set(i.invoice_number, i.trip_id)
  // trip_id → trip_number (para folio-auto y matched manual)
  const tripIds = [...new Set([...tripPorFolio.values(), ...rows.map(r => r.matched_trip_id as string).filter(Boolean)])]
  const tripNum = new Map<string, string>()
  if (tripIds.length) {
    const { data: trips } = await supabase.from('trips').select('id, trip_number').in('id', tripIds)
    for (const t of (trips ?? []) as Array<{ id: string; trip_number: string }>) tripNum.set(t.id, t.trip_number)
  }
  const cf = await asientosPorImport('CF')

  return rows.map(r => {
    const folioComp = `${(r.prefix as string) ?? ''}${(r.folio as string) ?? ''}`
    const mtrip = r.matched_trip_id as string | null
    const autoTrip = tripPorFolio.get(folioComp) ?? null
    const viajeId = mtrip ?? autoTrip
    return {
      id: r.id as string, folio: (r.folio as string) ?? '', prefix: (r.prefix as string) ?? '',
      issue_date: r.issue_date as string | null,
      cliente: (r.terceros as { razon_social: string | null } | null)?.razon_social ?? (r.name_receiver as string) ?? '—',
      terceroId: (r.tercero_id as string) ?? null,
      total: Number(r.total), status: (r.status as string) ?? '',
      viaje: viajeId ? (tripNum.get(viajeId) ?? null) : null,
      viajeId,
      viajeAuto: !mtrip && !!autoTrip,
      matchedTripId: mtrip,
      asiento: cf.get(r.id as string) ?? null,
    }
  })
}

/** TODOS los viajes — lista completa para elegir/corregir el viaje de una FEIT a mano. NO se
 *  filtra por cliente NI por fecha: la factura de julio puede corresponder a un viaje de otro
 *  mes (desfase) o a un cliente distinto del que el sistema asumió. El usuario elige el correcto. */
export async function getViajesFacturablesAction(): Promise<ViajeOption[]> {
  const data = await fetchAll<any>((from, to) => supabase.from('trips')
    .select('id, trip_number, freight_value, tercero_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona)')
    .order('trip_number').order('id', { ascending: true }).range(from, to))
  return data.map((t: unknown) => {
    const x = t as { id: string; trip_number: string; freight_value: number; tercero_id: string | null; terceros: Record<string, unknown> | null }
    return { id: x.id, tripNumber: x.trip_number, freight: Number(x.freight_value), terceroId: x.tercero_id, cliente: x.terceros ? nombreTercero(x.terceros) : '—' }
  })
}

export async function enlazarViajeFacturaAction(importId: string, tripId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('dian_invoices_import').update({ matched_trip_id: tripId }).eq('id', importId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/contabilidad/facturacion')
  return { ok: true }
}

export async function postearFacturacionAction(importId: string): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_facturacion_viaje', { p_import_id: importId })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/facturacion')
  return { ok: true, mensaje: `Ingreso contabilizado · asiento CF-${e?.consecutivo}` }
}

// ── Notas crédito emitidas ──────────────────────────────────────────────────
export async function getNotasCreditoEmitidasAction(): Promise<NotaCreditoFE[]> {
  const data = await fetchAll<any>((from, to) => supabase
    .from('dian_invoices_import')
    .select('id, folio, prefix, issue_date, name_receiver, total, status, fe_relacionada_id, terceros(razon_social)')
    .eq('grupo', 'EMITIDO').eq('document_type', NC)
    .order('issue_date', { ascending: false }).order('id', { ascending: true }).range(from, to))
  const ncs = data as Array<Record<string, unknown>>

  const feIds = [...new Set(ncs.map(n => n.fe_relacionada_id as string).filter(Boolean))]
  const feFolios = new Map<string, string>()
  if (feIds.length) {
    const { data: fes } = await supabase.from('dian_invoices_import').select('id, folio, prefix').in('id', feIds)
    for (const f of (fes ?? []) as Array<{ id: string; folio: string | null; prefix: string | null }>) feFolios.set(f.id, `${f.prefix ?? ''}${f.folio ?? ''}`)
  }
  const nc = await asientosPorImport('NC')

  return ncs.map(r => ({
    id: r.id as string, folio: (r.folio as string) ?? '', prefix: (r.prefix as string) ?? '',
    issue_date: r.issue_date as string | null,
    cliente: (r.terceros as { razon_social: string | null } | null)?.razon_social ?? (r.name_receiver as string) ?? '—',
    total: Number(r.total), status: (r.status as string) ?? '',
    feRelacionadaId: (r.fe_relacionada_id as string) ?? null,
    feRelacionadaFolio: r.fe_relacionada_id ? (feFolios.get(r.fe_relacionada_id as string) ?? null) : null,
    asiento: nc.get(r.id as string) ?? null,
  }))
}

export async function enlazarNotaCreditoAction(ncId: string, feId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('dian_invoices_import').update({ fe_relacionada_id: feId }).eq('id', ncId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/contabilidad/facturacion')
  return { ok: true }
}

export async function postearNotaCreditoAction(ncId: string): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await supabase.rpc('postear_nota_credito_emitida', { p_import_id: ncId })
  if (error) return { ok: false, mensaje: error.message }
  const { data: e } = await supabase.from('journal_entries').select('consecutivo').eq('id', data as string).single()
  revalidatePath('/contabilidad/facturacion')
  return { ok: true, mensaje: `Nota crédito contabilizada · asiento NC-${e?.consecutivo}` }
}
