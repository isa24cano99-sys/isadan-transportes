import { fetchLineasContabilizadas, saldoNaturaleza } from '@/lib/contabilidad-saldos'
import BalanceClient, { type FilaBalance } from './BalanceClient'

export const dynamic = 'force-dynamic'

async function getBalance(): Promise<FilaBalance[]> {
  const lineas = await fetchLineasContabilizadas()
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

export default async function BalanceComprobacionPage() {
  const filas = await getBalance()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Balance de comprobación</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Una fila por cuenta con movimiento: totales débito, crédito y saldo (según naturaleza).
          Es la portada del libro mayor — haz clic en una cuenta para ver su detalle.
        </p>
      </div>
      <BalanceClient filas={filas} />
    </div>
  )
}
