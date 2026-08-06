import Link from 'next/link'
import { getEstructuraFinanciera, agruparPorSubgrupo, getPeriodosDisponibles, type CuentaFin } from '@/lib/contabilidad-saldos'
import { formatCOP } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function Monto({ v, bold }: { v: number; bold?: boolean }) {
  return <span className={`tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ${v < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(v)}</span>
}

function CuentaRow({ c }: { c: CuentaFin }) {
  return (
    <div className="flex items-center justify-between py-1 pl-8 pr-1 text-sm">
      <span className="text-[#475569]"><span className="tabular-nums text-[#94A3B8] mr-2">{c.codigo}</span>{c.nombre}</span>
      <Monto v={c.monto} />
    </div>
  )
}

function Grupo({ titulo, clases, cuentas }: { titulo: string; clases: string[]; cuentas: CuentaFin[] }) {
  const subs = agruparPorSubgrupo(cuentas, clases)
  const total = subs.reduce((s, g) => s + g.subtotal, 0)
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#0F172A] uppercase tracking-wide">{titulo}</h2>
        <Monto v={total} bold />
      </div>
      <div className="p-2">
        {subs.length === 0 ? (
          <p className="text-sm text-[#94A3B8] pl-4 py-2">Sin movimiento en el período.</p>
        ) : subs.map(g => (
          <div key={g.subgrupo} className="mb-1 last:mb-0">
            <div className="flex items-center justify-between py-1 px-1 text-xs font-medium text-[#64748B]">
              <span>{g.subgrupo} · {g.label}</span>
              <Monto v={g.subtotal} />
            </div>
            {g.cuentas.map(c => <CuentaRow key={c.codigo} c={c} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function EstadoResultadosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const periodos = await getPeriodosDisponibles()
  const sp = await searchParams
  const sel = (sp.periodo && periodos.includes(sp.periodo)) ? sp.periodo : (periodos[0] ?? '')
  // Period-aware: solo el mes seleccionado, EXCLUYENDO el asiento de cierre (CC) — así un mes
  // ya cerrado sigue mostrando su actividad bruta, no cero. (El ESF sí es acumulado.)
  const e = await getEstructuraFinanciera({ periodo: sel, excluirCierre: true })
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Estado de Resultados</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Ingresos − Costos − Gastos = Utilidad (pérdida) del ejercicio, <strong>del periodo {sel || '—'}</strong>.
          Sobre el libro contable, clasificado por clase de cuenta PUC (excluye el asiento de cierre).
        </p>
      </div>

      {periodos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {periodos.map(p => (
            <Link key={p} href={`/contabilidad/estado-resultados?periodo=${p}`}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
              }`}>
              {p}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <Grupo titulo="Ingresos" clases={['4']} cuentas={e.cuentas} />
        <Grupo titulo="Costos" clases={['6', '7']} cuentas={e.cuentas} />
        <Grupo titulo="Gastos" clases={['5']} cuentas={e.cuentas} />

        <div className="bg-[#0F172A] text-white rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide">Utilidad (pérdida) del ejercicio</span>
          <span className={`text-base font-bold tabular-nums ${e.utilidad < 0 ? 'text-red-400' : 'text-emerald-300'}`}>{formatCOP(e.utilidad)}</span>
        </div>
        <p className="text-xs text-[#94A3B8] px-1">
          = Ingresos {formatCOP(e.ingresos)} − Costos {formatCOP(e.costos)} − Gastos {formatCOP(e.gastos)}.
          Esta utilidad aparece en el patrimonio del Estado de Situación Financiera como &ldquo;Utilidad (pérdida) del ejercicio&rdquo;.
        </p>
      </div>
    </div>
  )
}
