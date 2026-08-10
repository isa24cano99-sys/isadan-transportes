import Link from 'next/link'
import { getPeriodosContables, getPeriodoAbierto, ultimoDiaMes } from '@/lib/contabilidad-saldos'
import { fetchLineasReporte, mayorDesdeLineas } from '@/lib/contabilidad-reportes'
import LibroMayorClient from './LibroMayorClient'

export const dynamic = 'force-dynamic'

export default async function LibroMayorPage({ searchParams }: { searchParams: Promise<{ cuenta?: string; periodo?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? '')
  const sel = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : defecto
  const cuentas = sel ? mayorDesdeLineas(await fetchLineasReporte(ultimoDiaMes(sel)), sel) : []
  const inicial = (sp.cuenta && cuentas.some(c => c.cuenta === sp.cuenta)) ? sp.cuenta : (cuentas[0]?.cuenta ?? '')
  const hrefMes = (p: string) => `/contabilidad/libro-mayor?periodo=${p}${inicial ? `&cuenta=${inicial}` : ''}`

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Libro mayor</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Movimientos de una cuenta con su saldo corriente. Las cuentas que manejan tercero (proveedores,
          clientes, anticipos, nómina) se muestran <strong>desglosadas por tercero</strong>, cada uno con su
          saldo anterior y su saldo. La apertura (CA-1) es el saldo anterior del periodo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Mes:</span>
        {periodos.map(p => (
          <Link key={p} href={hrefMes(p)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p}
          </Link>
        ))}
      </div>

      <LibroMayorClient cuentas={cuentas} inicial={inicial} />
    </div>
  )
}
