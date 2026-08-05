import { getEstructuraFinanciera, agruparPorSubgrupo, type CuentaFin } from '@/lib/contabilidad-saldos'
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

function Subgrupos({ clases, cuentas }: { clases: string[]; cuentas: CuentaFin[] }) {
  const subs = agruparPorSubgrupo(cuentas, clases)
  if (subs.length === 0) return <p className="text-sm text-[#94A3B8] pl-4 py-2">Sin saldo.</p>
  return (
    <>
      {subs.map(g => (
        <div key={g.subgrupo} className="mb-1 last:mb-0">
          <div className="flex items-center justify-between py-1 px-1 text-xs font-medium text-[#64748B]">
            <span>{g.subgrupo} · {g.label}</span>
            <Monto v={g.subtotal} />
          </div>
          {g.cuentas.map(c => <CuentaRow key={c.codigo} c={c} />)}
        </div>
      ))}
    </>
  )
}

function GrupoTotal({ titulo, total }: { titulo: string; total: number }) {
  return (
    <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[#0F172A] uppercase tracking-wide">{titulo}</h2>
      <Monto v={total} bold />
    </div>
  )
}

export default async function EstadoSituacionPage() {
  const e = await getEstructuraFinanciera()
  const patrimonioTotal = e.patrimonio + e.utilidad          // acumulado + resultado del período
  const pasivoMasPatrimonio = e.pasivo + patrimonioTotal
  const cuadra = Math.abs(e.activo - pasivoMasPatrimonio) < 0.01

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Estado de Situación Financiera</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Activo = Pasivo + Patrimonio. Sobre el libro contable, clasificado por clase de cuenta PUC.
          Todo corriente por ahora (no hay activos ni pasivos de largo plazo).
        </p>
      </div>

      <div className="space-y-3">
        {/* ACTIVO */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <GrupoTotal titulo="Activo" total={e.activo} />
          <div className="p-2"><Subgrupos clases={['1']} cuentas={e.cuentas} /></div>
        </div>

        {/* PASIVO */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <GrupoTotal titulo="Pasivo" total={e.pasivo} />
          <div className="p-2"><Subgrupos clases={['2']} cuentas={e.cuentas} /></div>
        </div>

        {/* PATRIMONIO */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <GrupoTotal titulo="Patrimonio" total={patrimonioTotal} />
          <div className="p-2">
            <Subgrupos clases={['3']} cuentas={e.cuentas} />
            <div className="flex items-center justify-between py-1.5 px-1 mt-1 border-t border-[#F1F5F9] text-sm">
              <span className="text-[#0F172A] font-medium">Utilidad (pérdida) del ejercicio</span>
              <Monto v={e.utilidad} bold />
            </div>
          </div>
        </div>

        {/* CUADRE */}
        <div className="bg-[#0F172A] text-white rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wide">Pasivo + Patrimonio</span>
            <span className="text-base font-bold tabular-nums">{formatCOP(pasivoMasPatrimonio)}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-white/70">
            <span className="text-xs">Total activo</span>
            <span className="text-xs tabular-nums">{formatCOP(e.activo)}</span>
          </div>
          <div className={`mt-2 text-xs font-medium px-2 py-0.5 rounded-full inline-block ${cuadra ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
            {cuadra ? '✓ Activo = Pasivo + Patrimonio' : '⚠ No cuadra'}
          </div>
        </div>

        <p className="text-xs text-[#94A3B8] px-1">
          Patrimonio = acumulado (Resultados acumulados + capital) + Utilidad del ejercicio. El patrimonio
          negativo refleja la pérdida acumulada de la apertura (desfase caja/facturación); es real y transitorio.
        </p>
      </div>
    </div>
  )
}
