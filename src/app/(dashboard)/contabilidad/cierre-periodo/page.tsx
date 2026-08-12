import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { getPeriodosDisponibles, getEstructuraFinanciera } from '@/lib/contabilidad-saldos'
import CierrePeriodoClient, { type FilaPeriodo } from './CierrePeriodoClient'

export const dynamic = 'force-dynamic'

async function getPeriodos(): Promise<FilaPeriodo[]> {
  const periodos = await getPeriodosDisponibles()

  const { data: pc } = await supabase
    .from('periodos_contables').select('periodo, estado, fecha_cierre')
  const estadoBy = new Map((pc ?? []).map((x: any) => [x.periodo, x]))

  const cc = await fetchAll<any>((from, to) => supabase
    .from('journal_entries').select('periodo, consecutivo')
    .eq('tipo_comprobante', 'CC').eq('estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  const ccBy = new Map(cc.map((x: any) => [x.periodo, x.consecutivo]))

  const filas: FilaPeriodo[] = []
  for (const p of periodos) {
    const e = await getEstructuraFinanciera({ periodo: p, excluirCierre: true })
    const est: any = estadoBy.get(p)
    filas.push({
      periodo: p,
      estado: (est?.estado ?? 'ABIERTO') as 'ABIERTO' | 'CERRADO',
      fechaCierre: (est?.fecha_cierre ?? null) as string | null,
      ingresos: e.ingresos, costos: e.costos, gastos: e.gastos, utilidad: e.utilidad,
      ccConsecutivo: (ccBy.get(p) ?? null) as number | null,
    })
  }
  return filas
}

export default async function CierrePeriodoPage() {
  const filas = await getPeriodos()
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Cierre de periodo</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Cerrar un mes postea el asiento de cierre (CC) que traslada el resultado a 3610 Resultados
          Acumulados y bloquea nuevos asientos con fecha en ese mes.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
          ⚠ Cierra un mes solo cuando esté <strong>completo</strong> (toda la nómina, costos y facturas capturados).
          Reabrir quita el candado pero <strong>no borra</strong> el CC — para re-cerrar hay que anularlo con una reversión.
        </p>
      </div>
      <CierrePeriodoClient filas={filas} />
    </div>
  )
}
