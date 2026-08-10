import Link from 'next/link'
import { fetchLineasContabilizadas, saldoNaturaleza, getPeriodosContables, getPeriodoAbierto, ultimoDiaMes, type LineaMov } from '@/lib/contabilidad-saldos'
import LibroMayorClient, { type CuentaMayor } from './LibroMayorClient'

export const dynamic = 'force-dynamic'

async function getMayor(hasta?: string): Promise<CuentaMayor[]> {
  const lineas = await fetchLineasContabilizadas(hasta ? { hasta } : undefined)
  const acc = new Map<string, { cuenta: string; nombre: string; naturaleza: string; movs: LineaMov[]; sumD: number; sumC: number }>()
  for (const l of lineas) {
    let a = acc.get(l.cuenta)
    if (!a) { a = { cuenta: l.cuenta, nombre: l.cuentaNombre, naturaleza: l.naturaleza, movs: [], sumD: 0, sumC: 0 }; acc.set(l.cuenta, a) }
    a.movs.push(l)
    a.sumD += l.debito
    a.sumC += l.credito
  }

  const cuentas = [...acc.values()].map(a => {
    // apertura (CA) fija primero; luego cronológico por fecha, desempate tipo+consecutivo
    a.movs.sort((x, y) => {
      const ax = x.tipo === 'CA' ? 0 : 1, ay = y.tipo === 'CA' ? 0 : 1
      return ax - ay || x.fecha.localeCompare(y.fecha) || x.tipo.localeCompare(y.tipo) || x.consecutivo - y.consecutivo
    })
    // saldo corriente por naturaleza (aporte con signo línea a línea)
    let saldo = 0
    const movimientos = a.movs.map(m => {
      const aporte = a.naturaleza === 'DEBITO' ? m.debito - m.credito : m.credito - m.debito
      saldo += aporte
      return {
        fecha: m.fecha, comprobante: m.comprobante, tipo: m.tipo, descripcion: m.descripcion,
        tercero: m.tercero, centroCosto: m.centroCosto, debito: m.debito, credito: m.credito,
        saldoCorriente: saldo, esApertura: m.tipo === 'CA',
      }
    })
    return {
      cuenta: a.cuenta, nombre: a.nombre, naturaleza: a.naturaleza,
      sumDebito: a.sumD, sumCredito: a.sumC, saldo: saldoNaturaleza(a.naturaleza, a.sumD, a.sumC),
      movimientos,
    }
  }).sort((x, y) => x.cuenta.localeCompare(y.cuenta))

  return cuentas
}

export default async function LibroMayorPage({ searchParams }: { searchParams: Promise<{ cuenta?: string; hasta?: string }> }) {
  const [periodos, abierto, sp] = await Promise.all([getPeriodosContables(), getPeriodoAbierto(), searchParams])
  const defecto = (abierto && periodos.includes(abierto)) ? abierto : (periodos[0] ?? 'todo')
  const sel = sp.hasta && (sp.hasta === 'todo' || periodos.includes(sp.hasta)) ? sp.hasta : defecto
  const cutoff = sel === 'todo' ? undefined : ultimoDiaMes(sel)
  const cuentas = await getMayor(cutoff)
  const inicial = (sp.cuenta && cuentas.some(c => c.cuenta === sp.cuenta)) ? sp.cuenta : (cuentas[0]?.cuenta ?? '')

  const opciones = [...periodos, 'todo']
  const hrefCorte = (p: string) => `/contabilidad/libro-mayor?hasta=${p}${inicial ? `&cuenta=${inicial}` : ''}`
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Libro mayor</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Todos los movimientos de una cuenta con su saldo corriente. El saldo de apertura va
          primero como ancla; los demás movimientos siguen en orden de fecha.
          {cutoff && <> Cortado <strong>hasta el {cutoff}</strong>.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-[#94A3B8] mr-1">Corte:</span>
        {opciones.map(p => (
          <Link key={p} href={hrefCorte(p)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              p === sel ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
            }`}>
            {p === 'todo' ? 'Todo (hasta hoy)' : `Hasta ${p}`}
          </Link>
        ))}
      </div>

      <LibroMayorClient cuentas={cuentas} inicial={inicial} />
    </div>
  )
}
