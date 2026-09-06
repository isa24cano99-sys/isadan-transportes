import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import CruceClient from './CruceClient'

export const dynamic = 'force-dynamic'

// Elegibles = terceros con anticipo disponible en 28050510 (CR - DB > 0) Y cartera
// facturada en 13050501 (DB - CR > 0), calculados desde el LIBRO CONTABLE real
// (journal_entry_lines CONTABILIZADO), no desde accounts_receivable_entries. Así el
// cruce ve toda la facturación posteada (CF), incluidas las que no crean AR entry.
// El monto = MIN(anticipo, cartera) del tercero. Cero automatismo — Isabella confirma.
async function getElegibles() {
  const lines = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('cuenta_puc, tercero_id, debito, credito, journal_entries!inner(estado)')
    .in('cuenta_puc', ['28050510', '13050501'])
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))

  const anticipo = new Map<string, number>()
  const cartera = new Map<string, number>()
  for (const l of lines as any[]) {
    if (!l.tercero_id) continue
    const d = Number(l.debito) || 0
    const c = Number(l.credito) || 0
    if (l.cuenta_puc === '28050510') anticipo.set(l.tercero_id, (anticipo.get(l.tercero_id) ?? 0) + c - d)
    else cartera.set(l.tercero_id, (cartera.get(l.tercero_id) ?? 0) + d - c)
  }

  const ids = [...anticipo.keys()].filter(t => (anticipo.get(t) ?? 0) > 0 && (cartera.get(t) ?? 0) > 0)
  if (!ids.length) return []

  // Nombres (fuente única: terceros) y conteo de facturas (CF) que componen la cartera.
  const ter = await fetchAll<any>((from, to) => supabase
    .from('terceros')
    .select('id, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona')
    .in('id', ids).range(from, to))
  const nom = new Map((ter as any[]).map(t => [t.id, nombreTercero(t)]))

  const cf = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('tercero_id, journal_entries!inner(tipo_comprobante, estado)')
    .eq('cuenta_puc', '13050501')
    .eq('journal_entries.tipo_comprobante', 'CF')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .in('tercero_id', ids).range(from, to))
  const facturas = new Map<string, number>()
  for (const l of cf as any[]) facturas.set(l.tercero_id, (facturas.get(l.tercero_id) ?? 0) + 1)

  return ids
    .map(t => {
      const ant = anticipo.get(t) ?? 0
      const car = cartera.get(t) ?? 0
      return {
        id: t,
        cliente: (nom.get(t) ?? t.slice(0, 8)) as string,
        anticipoDisp: ant,
        carteraPendiente: car,
        facturas: facturas.get(t) ?? 0,
        monto: Math.min(ant, car),
      }
    })
    .filter(e => e.monto > 0)
    .sort((a, b) => b.monto - a.monto)
}

export default async function CrucePage() {
  const elegibles = await getElegibles()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Cruce de cartera</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Clientes con cartera facturada (13050501) que además tienen un anticipo disponible
          (28050510). El cruce reclasifica el anticipo contra la cartera (DB 28050510 / CR 13050501)
          por el menor de los dos saldos. Nada se cruza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Saldos tomados del libro contable real (asientos contabilizados), no de una tabla aparte —
          incluye toda la facturación posteada del tercero.
        </p>
      </div>
      <CruceClient elegibles={elegibles} />
    </div>
  )
}
