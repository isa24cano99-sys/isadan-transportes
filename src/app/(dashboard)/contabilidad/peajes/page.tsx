import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import PeajesClient, { type MesPeaje } from './PeajesClient'

export const dynamic = 'force-dynamic'

const F2X_NIT = '900219834'

// Elegibles = meses (desde 2026-07) con FE neto de F2X > 0 en dian_invoices_import,
// que aún no tienen causación CG de peaje F2X (línea 61450575) contabilizada.
async function getMeses(): Promise<MesPeaje[]> {
  const imp = await fetchAll<any>((from, to) => supabase
    .from('dian_invoices_import')
    .select('document_type, total, issue_date')
    .eq('grupo', 'RECIBIDO')          // F2X (peajes) son recibidas; blindaje contra emitidas en la misma tabla
    .eq('nit_issuer', F2X_NIT)
    .gte('issue_date', '2026-07-01')
    .order('id', { ascending: true }).range(from, to))

  const byMes = new Map<string, { fac: number; nc: number }>()
  for (const x of imp as any[]) {
    const mes = (x.issue_date ?? '').slice(0, 7)
    if (!mes) continue
    let m = byMes.get(mes)
    if (!m) { m = { fac: 0, nc: 0 }; byMes.set(mes, m) }
    if (x.document_type === 'Factura electrónica') m.fac += Number(x.total)
    else if (x.document_type === 'Nota de crédito electrónica') m.nc += Number(x.total)
  }

  const cgLines = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('journal_entries!inner(periodo, tipo_comprobante, estado)')
    .eq('cuenta_puc', '61450575')
    .eq('journal_entries.tipo_comprobante', 'CG')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  const causados = new Set(cgLines.map((x: any) => x.journal_entries.periodo))

  return [...byMes.entries()]
    .map(([mes, v]) => ({ mes, facturas: v.fac, notasCredito: v.nc, neto: v.fac - v.nc, causado: causados.has(mes) }))
    .filter(m => m.neto > 0)
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

export default async function PeajesPage() {
  const meses = await getMeses()
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Peajes (F2X)</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Causación mensual del peaje de F2X desde la factura electrónica (DIAN): neto del mes
          (facturas − notas crédito) → DB 61450575 Peajes / CR 220501 Proveedores (tercero F2X).
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          La FE es la fuente del costo; el pago vía banco (Flypass) se concilia como pieza aparte.
          Sin centro de costo: la FE no trae placa. Nada se causa sin tu confirmación.
        </p>
      </div>
      <PeajesClient meses={meses} />
    </div>
  )
}
