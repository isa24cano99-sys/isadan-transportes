import Link from 'next/link'
import { getPeriodosContables, getPeriodoAbierto } from '@/lib/contabilidad-saldos'
import { fetchLineasReporte, saldosDesdeLineas } from '@/lib/contabilidad-reportes'
import BalanceClient from './BalanceClient'
import { ultimoDiaMes } from '@/lib/contabilidad-saldos'

export const dynamic = 'force-dynamic'

export default async function BalanceComprobacionPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? '')
  const sel = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : defecto
  const filas = sel ? saldosDesdeLineas(await fetchLineasReporte(ultimoDiaMes(sel)), sel) : []

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Balance de comprobación</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Por cuenta: <strong>saldo anterior</strong> (apertura), <strong>movimiento del periodo</strong> (débito/crédito
          del mes) y <strong>saldo final</strong>. El asiento de apertura CA-1 va como saldo anterior, no como movimiento.
          Haz clic en una cuenta para ver su detalle en el libro mayor.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {periodos.map(p => (
          <Link key={p} href={`/contabilidad/balance-comprobacion?periodo=${p}`}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p}
          </Link>
        ))}
      </div>

      <BalanceClient filas={filas} />
    </div>
  )
}
