import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import TercerosClient, { type TerceroRow, type Municipio, type DuplicadoPar } from './TercerosClient'
import { esNitConDVPegado } from '@/lib/nit'

export const dynamic = 'force-dynamic'

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export default async function TercerosPage() {
  const [{ data: terceros }, bank, inv, are, muniRes, { data: cuentas }] = await Promise.all([
    supabase.from('terceros').select('*').is('merged_into', null).order('created_at'),
    fetchAll<any>((from, to) => supabase.from('bank_transactions').select('supplier_nit, amount').order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('invoices').select('client_nit, total_amount').order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('accounts_receivable_entries').select('client_nit, invoice_amount').order('id', { ascending: true }).range(from, to)),
    supabase.from('municipios_dane').select('*'), // puede no existir aún (CSV pendiente)
    supabase.from('puc_accounts').select('codigo, nombre').eq('active', true).order('codigo'),
  ])

  // Monto y nº de registros asociados por identificación
  const money = new Map<string, number>()
  const recs = new Map<string, number>()
  const add = (nit: string | null | undefined, amt: unknown) => {
    const k = digits(nit); if (!k) return
    money.set(k, (money.get(k) ?? 0) + (Number(amt) || 0))
    recs.set(k, (recs.get(k) ?? 0) + 1)
  }
  for (const b of bank as any[]) add(b.supplier_nit, b.amount)
  for (const i of inv as any[]) add(i.client_nit, i.total_amount)
  for (const a of are as any[]) add(a.client_nit, a.invoice_amount)

  const rows: TerceroRow[] = ((terceros ?? []) as any[]).map(t => ({
    ...t,
    monto: money.get(t.numero_identificacion) ?? 0,
    registros: recs.get(t.numero_identificacion) ?? 0,
  }))
  // Incompletos primero, luego por monto desc
  rows.sort((a, b) => (Number(a.completo) - Number(b.completo)) || (b.monto - a.monto))

  // Duplicados detectados: pegados activos cuya base también existe activa
  const byNum = new Map(rows.map(r => [r.numero_identificacion, r]))
  const duplicados: DuplicadoPar[] = []
  for (const r of rows) {
    const p = esNitConDVPegado(r.numero_identificacion)
    if (p && byNum.has(p.base)) {
      const base = byNum.get(p.base)!
      duplicados.push({
        sobreviviente: { id: base.id, numero: base.numero_identificacion, nombre: base.razon_social ?? base.primer_nombre ?? '', registros: base.registros, monto: base.monto },
        duplicado:     { id: r.id, numero: r.numero_identificacion, nombre: r.razon_social ?? r.primer_nombre ?? '', registros: r.registros, monto: r.monto },
      })
    }
  }

  const municipios: Municipio[] = ((muniRes.data ?? []) as any[]).map(m => ({
    codigo_departamento: m.codigo_departamento,
    nombre_departamento: m.nombre_departamento,
    codigo_municipio:    m.codigo_municipio,
    nombre_municipio:    m.nombre_municipio,
  }))

  return (
    <TercerosClient
      terceros={rows}
      municipios={municipios}
      duplicados={duplicados}
      municipiosDisponibles={!muniRes.error && municipios.length > 0}
      cuentasCosto={(cuentas ?? []) as { codigo: string; nombre: string }[]}
    />
  )
}
