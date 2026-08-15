import Link from 'next/link'
import { getPeriodosContables, getPeriodoAbierto } from '@/lib/contabilidad-saldos'
import { reportesContador, type SaldoPeriodo } from '@/lib/contabilidad-reportes'
import { formatCOP } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const montoERI = (b: SaldoPeriodo) => {
  const c = b.cuenta.charAt(0)
  return (c === '5' || c === '6' || c === '7') ? b.debitoPeriodo - b.creditoPeriodo : b.creditoPeriodo - b.debitoPeriodo
}
function Monto({ v, bold }: { v: number; bold?: boolean }) {
  return <span className={`tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ${v < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(v)}</span>
}

function Grupo({ titulo, cuentas, total, signo = '' }: { titulo: string; cuentas: SaldoPeriodo[]; total: number; signo?: string }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wide">{signo}{titulo}</h2>
        <Monto v={total} bold />
      </div>
      <div className="py-1">
        {cuentas.length === 0
          ? <p className="text-sm text-[#94A3B8] px-4 py-1.5">Sin movimiento en el período.</p>
          : cuentas.map(c => (
            <div key={c.cuenta} className="flex items-center justify-between py-1 pl-8 pr-4 text-sm">
              <span className="text-[#475569]"><span className="tabular-nums text-[#94A3B8] mr-2">{c.cuenta}</span>{c.nombre}</span>
              <Monto v={montoERI(c)} />
            </div>
          ))}
      </div>
    </div>
  )
}

function Subtotal({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[#EEF2FF] border border-[#C7D2FE]">
      <span className="text-sm font-semibold text-[#3730A3] uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${v < 0 ? 'text-red-600' : 'text-[#3730A3]'}`}>{formatCOP(v)}</span>
    </div>
  )
}

export default async function EstadoResultadosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? '')
  const sel = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : defecto
  const e = sel ? (await reportesContador(sel)).eri : null

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Estado de Resultados</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Separando lo <strong>operacional</strong> de lo <strong>financiero / no operacional</strong>, con
          utilidad bruta y utilidad operacional. Movimiento del periodo, sobre el libro contable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {periodos.map(p => (
          <Link key={p} href={`/contabilidad/estado-resultados?periodo=${p}`}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p}
          </Link>
        ))}
      </div>

      {!e ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">No hay periodos con asientos.</p>
      ) : (
        <div className="space-y-2.5">
          <Grupo titulo="Ingresos operacionales" cuentas={e.ingresosOper} total={e.totalIngresosOper} />
          <Grupo titulo="Costos" cuentas={e.costos} total={e.totalCostos} signo="− " />
          <Subtotal label="= Utilidad bruta" v={e.utilidadBruta} />
          <Grupo titulo="Gastos operacionales (admin. y personal)" cuentas={e.gastosOper} total={e.totalGastosOper} signo="− " />
          <Subtotal label="= Utilidad operacional" v={e.utilidadOperacional} />
          <Grupo titulo="Ingresos financieros / no operacionales" cuentas={e.ingresosFin} total={e.totalIngresosFin} signo="+ " />
          <Grupo titulo="Gastos financieros / no operacionales" cuentas={e.gastosFin} total={e.totalGastosFin} signo="− " />
          <div className="bg-[#0F172A] text-white rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wide">Utilidad (pérdida) del ejercicio</span>
            <span className={`text-base font-bold tabular-nums ${e.utilidad < 0 ? 'text-red-400' : 'text-emerald-300'}`}>{formatCOP(e.utilidad)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
