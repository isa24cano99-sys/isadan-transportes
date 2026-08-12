/**
 * Estado de las FE DIAN (no-F2X) de un periodo — fuente única compartida por:
 *   · /contabilidad/conciliacion-costos (la vista con estado)
 *   · el selector "vincular factura DIAN" del modal de banco
 * Server-only (importa supabase). Modelo de 2 ejes: asignación (legalización / banco /
 * contabilizada directa / sin asignar) + clasificación (cuenta_puc_sugerida, aparte).
 */
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'

const F2X = '900219834'

export type EstadoFE = 'legalizacion' | 'banco' | 'contabilizada' | 'sin_asignar'
export type FeEstado = {
  id: string
  emisor: string
  folio: string
  fecha: string
  monto: number
  terceroId: string | null
  cuentaSugerida: string | null
  estado: EstadoFE
  etiqueta: string | null   // manifiesto (legalización) o fecha (banco)
}

/** FE no-F2X en [desde, hasta) con su estado de asignación resuelto. */
export async function facturasConEstado(desde: string, hasta: string): Promise<FeEstado[]> {
  const inv = await fetchAll<any>((from, to) => supabase
    .from('dian_invoices_import')
    .select('id, folio, issue_date, name_issuer, total, tercero_id, terceros(razon_social, cuenta_puc_sugerida)')
    .eq('grupo', 'RECIBIDO')          // solo costos recibidos — las emitidas viven en la misma tabla
    .neq('nit_issuer', F2X)
    .gte('issue_date', desde).lt('issue_date', hasta)
    .neq('document_type', 'Application response')
    .order('issue_date').order('id', { ascending: true }).range(from, to))

  const [cg, le, bt] = await Promise.all([
    fetchAll<any>((from, to) => supabase.from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'dian_invoices_import').eq('tipo_comprobante', 'CG').eq('estado', 'CONTABILIZADO')
      .order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('legalization_expenses').select('matched_invoice_id, legalizations(trips(manifest_number))')
      .not('matched_invoice_id', 'is', null)
      .order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('bank_transactions').select('matched_invoice_id, date').not('matched_invoice_id', 'is', null)
      .order('id', { ascending: true }).range(from, to)),
  ])
  const posted = new Set(cg.map((x: any) => x.origen_id))
  const legMap = new Map(
    le.filter((x: any) => x.matched_invoice_id)
      .map((x: any) => [x.matched_invoice_id, (x.legalizations?.trips?.manifest_number ?? null) as string | null]))
  const bankMap = new Map(bt.map((x: any) => [x.matched_invoice_id, x.date as string]))

  return inv.map((v: any) => {
    const ter = v.terceros
    let estado: EstadoFE = 'sin_asignar'
    let etiqueta: string | null = null
    if (posted.has(v.id)) { estado = 'contabilizada' }
    else if (legMap.has(v.id)) { estado = 'legalizacion'; etiqueta = legMap.get(v.id) ?? null }
    else if (bankMap.has(v.id)) { estado = 'banco'; etiqueta = bankMap.get(v.id) ?? null }
    return {
      id: v.id,
      emisor: (ter?.razon_social ?? v.name_issuer ?? '—') as string,
      folio: String(v.folio),
      fecha: v.issue_date as string,
      monto: Number(v.total),
      terceroId: (v.tercero_id ?? null) as string | null,
      cuentaSugerida: (ter?.cuenta_puc_sugerida ?? null) as string | null,
      estado, etiqueta,
    }
  })
}
