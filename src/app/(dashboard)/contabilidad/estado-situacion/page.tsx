import Link from 'next/link'
import { getPeriodosContables, getPeriodoAbierto } from '@/lib/contabilidad-saldos'
import { reportesContador, type SaldoPeriodo } from '@/lib/contabilidad-reportes'
import { formatCOP } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function Monto({ v, bold, muted }: { v: number; bold?: boolean; muted?: boolean }) {
  return <span className={`tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ${muted ? 'text-[#94A3B8]' : v < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(v)}</span>
}

function Seccion({ titulo, cuentas, total }: { titulo: string; cuentas: SaldoPeriodo[]; total: number }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#0F172A] uppercase tracking-wide">{titulo}</h2>
        <Monto v={total} bold />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[#94A3B8] text-[10px] uppercase tracking-wide border-b border-[#F1F5F9]">
            <th className="text-left font-medium px-4 py-1.5">Cuenta</th>
            <th className="text-right font-medium px-3 py-1.5">Saldo anterior</th>
            <th className="text-right font-medium px-3 py-1.5">Movimiento</th>
            <th className="text-right font-medium px-4 py-1.5">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.length === 0 ? (
            <tr><td colSpan={4} className="text-sm text-[#94A3B8] px-4 py-2">Sin saldo.</td></tr>
          ) : cuentas.map(c => (
            <tr key={c.cuenta} className="border-b border-[#F1F5F9] last:border-0">
              <td className="px-4 py-1.5 text-[#475569]"><span className="tabular-nums text-[#94A3B8] mr-2">{c.cuenta}</span>{c.nombre}</td>
              <td className="px-3 py-1.5 text-right"><Monto v={c.saldoAnterior} muted /></td>
              <td className="px-3 py-1.5 text-right"><Monto v={c.saldoFinal - c.saldoAnterior} /></td>
              <td className="px-4 py-1.5 text-right"><Monto v={c.saldoFinal} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function EstadoSituacionPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? '')
  const sel = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : defecto
  const data = sel ? await reportesContador(sel) : null
  const e = data?.esf
  const patrimonioTotal = (e?.totalPatrimonio ?? 0) + (e?.utilidad ?? 0)
  const pasivoMasPatrimonio = (e?.totalPasivo ?? 0) + patrimonioTotal
  const cuadra = e ? Math.abs(e.totalActivo - pasivoMasPatrimonio) < 0.01 : false

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Estado de Situación Financiera</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Activo = Pasivo + Patrimonio, cortado al cierre del mes. Saldo anterior (apertura) · movimiento del
          periodo · saldo final. Todo corriente por ahora.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {periodos.map(p => (
          <Link key={p} href={`/contabilidad/estado-situacion?periodo=${p}`}
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
        <div className="space-y-3">
          <Seccion titulo="Activo" cuentas={e.activo} total={e.totalActivo} />
          <Seccion titulo="Pasivo" cuentas={e.pasivo} total={e.totalPasivo} />
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <Seccion titulo="Patrimonio" cuentas={e.patrimonio} total={patrimonioTotal} />
            <div className="flex items-center justify-between py-2 px-4 border-t border-[#F1F5F9] text-sm">
              <span className="text-[#0F172A] font-medium">Utilidad (pérdida) del ejercicio</span>
              <Monto v={e.utilidad} bold />
            </div>
          </div>

          <div className="bg-[#0F172A] text-white rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide">Pasivo + Patrimonio</span>
              <span className="text-base font-bold tabular-nums">{formatCOP(pasivoMasPatrimonio)}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-white/70">
              <span className="text-xs">Total activo</span>
              <span className="text-xs tabular-nums">{formatCOP(e.totalActivo)}</span>
            </div>
            <div className={`mt-2 text-xs font-medium px-2 py-0.5 rounded-full inline-block ${cuadra ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {cuadra ? '✓ Activo = Pasivo + Patrimonio' : '⚠ No cuadra'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
