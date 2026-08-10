import Link from 'next/link'
import { fetchLineasContabilizadas, saldoNaturaleza, getPeriodosContables, getPeriodoAbierto, ultimoDiaMes } from '@/lib/contabilidad-saldos'
import BalanceClient, { type FilaBalance } from './BalanceClient'

export const dynamic = 'force-dynamic'

async function getBalance(hasta?: string): Promise<FilaBalance[]> {
  const lineas = await fetchLineasContabilizadas(hasta ? { hasta } : undefined)
  const acc = new Map<string, FilaBalance>()
  for (const l of lineas) {
    let a = acc.get(l.cuenta)
    if (!a) {
      a = { cuenta: l.cuenta, nombre: l.cuentaNombre, naturaleza: l.naturaleza, sumDebito: 0, sumCredito: 0, lineas: 0, saldo: 0 }
      acc.set(l.cuenta, a)
    }
    a.sumDebito += l.debito
    a.sumCredito += l.credito
    a.lineas++
  }
  const filas = [...acc.values()]
  for (const a of filas) a.saldo = saldoNaturaleza(a.naturaleza, a.sumDebito, a.sumCredito)
  filas.sort((x, y) => x.cuenta.localeCompare(y.cuenta))
  return filas
}

export default async function BalanceComprobacionPage({ searchParams }: { searchParams: Promise<{ hasta?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  // `sp.hasta` es un periodo 'YYYY-MM' (corte al último día de ese mes) o 'todo' (sin corte).
  // Por defecto: el mes ABIERTO (el que se está cerrando), o el periodo más reciente.
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? 'todo')
  const sel = sp.hasta && (sp.hasta === 'todo' || periodos.includes(sp.hasta)) ? sp.hasta : defecto
  const cutoff = sel === 'todo' ? undefined : ultimoDiaMes(sel)
  const filas = await getBalance(cutoff)

  const opciones = [...periodos, 'todo']
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Balance de comprobación</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Una fila por cuenta con movimiento: totales débito, crédito y saldo (según naturaleza).
          {cutoff
            ? <> Saldo acumulado <strong>hasta el {cutoff}</strong> (solo asientos con fecha ≤ ese día).</>
            : <> Saldo acumulado <strong>de todo el histórico</strong>.</>}
          {' '}Es la portada del libro mayor — haz clic en una cuenta para ver su detalle.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Corte:</span>
        {opciones.map(p => (
          <Link key={p} href={`/contabilidad/balance-comprobacion?hasta=${p}`}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p === 'todo' ? 'Todo (hasta hoy)' : `Hasta ${p}`}
          </Link>
        ))}
      </div>

      <BalanceClient filas={filas} />
    </div>
  )
}
