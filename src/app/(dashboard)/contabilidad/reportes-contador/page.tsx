import Link from 'next/link'
import { getPeriodosContables, getPeriodoAbierto } from '@/lib/contabilidad-saldos'
import { reportesContador } from '@/lib/contabilidad-reportes'
import ReportesContadorClient from './ReportesContadorClient'

export const dynamic = 'force-dynamic'

export default async function ReportesContadorPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? '')
  const sel = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : defecto
  const data = sel ? await reportesContador(sel) : null

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Reportes para el contador</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Genera los <strong>5 reportes contables del mes en un solo archivo Excel</strong> (Libro Diario,
          Libro Mayor, Balance de Comprobación, Estado de Situación y Estado de Resultados), cortado al
          cierre del mes seleccionado. El asiento de apertura (CA-1) sale como <strong>saldo anterior</strong>,
          no como movimiento del periodo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {periodos.map(p => (
          <Link key={p} href={`/contabilidad/reportes-contador?periodo=${p}`}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p}
          </Link>
        ))}
      </div>

      {data
        ? <ReportesContadorClient data={data} />
        : <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">No hay periodos con asientos contabilizados.</p>}
    </div>
  )
}
