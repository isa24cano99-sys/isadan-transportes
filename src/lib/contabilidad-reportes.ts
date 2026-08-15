import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import { saldoNaturaleza, ultimoDiaMes } from '@/lib/contabilidad-saldos'

// ════════════════════════════════════════════════════════════════════════════
// Capa de datos de los 5 reportes para el contador. TODO sale de un mismo fetch
// de líneas contabilizadas hasta la fecha de corte, para que las hojas cuadren
// entre sí por construcción (Balance = Mayor sumado; ESF ↔ ERI vía utilidad).
//
// Descomposición por periodo (mes 'YYYY-MM'):
//   · saldo ANTERIOR  = líneas de apertura (tipo CA) + cualquier no-CA con fecha
//                       < inicio del mes  (hoy no hay pre-CA post-apertura).
//   · MOVIMIENTO      = líneas no-CA con inicio ≤ fecha ≤ último día del mes.
//   · saldo FINAL     = anterior + movimiento.
// Así CA-1 siempre es "saldo anterior" y nada de meses posteriores (p.ej. agosto)
// se cuela en el corte del mes exportado.
// ════════════════════════════════════════════════════════════════════════════

export type LineaRep = {
  cuenta: string; nombre: string; naturaleza: string; exigeTercero: boolean
  tipo: string; consecutivo: number; comprobante: string
  fecha: string; descripcion: string; docSoporte: string | null
  terceroId: string | null; terceroNit: string | null; tercero: string | null
  centroCosto: string | null
  debito: number; credito: number
}

export async function fetchLineasReporte(hasta?: string): Promise<LineaRep[]> {
  // Paginado (fetchAll): journal_entry_lines crece cada mes y ya está cerca de 1000 —
  // sin paginar, los reportes truncarían líneas y descuadrarían.
  const data = await fetchAll<any>((from, to) => {
    let q = supabase
      .from('journal_entry_lines')
      .select(
        'debito, credito, centro_costo, cuenta_puc, tercero_id, tercero_nit_snapshot,' +
        'puc_accounts(nombre, naturaleza, exige_tercero),' +
        'terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),' +
        'journal_entries!inner(tipo_comprobante, consecutivo, fecha, descripcion, documento_soporte, estado)',
      )
      .eq('journal_entries.estado', 'CONTABILIZADO')
    if (hasta) q = q.lte('journal_entries.fecha', hasta)
    return q.order('id', { ascending: true }).range(from, to)
  })
  return (data as any[]).map(l => ({
    cuenta: l.cuenta_puc,
    nombre: l.puc_accounts?.nombre ?? '',
    naturaleza: l.puc_accounts?.naturaleza ?? '',
    exigeTercero: !!l.puc_accounts?.exige_tercero,
    tipo: l.journal_entries.tipo_comprobante,
    consecutivo: l.journal_entries.consecutivo,
    comprobante: `${l.journal_entries.tipo_comprobante}-${l.journal_entries.consecutivo}`,
    fecha: l.journal_entries.fecha,
    descripcion: l.journal_entries.descripcion ?? '',
    docSoporte: l.journal_entries.documento_soporte ?? null,
    terceroId: l.tercero_id ?? null,
    terceroNit: l.tercero_nit_snapshot ?? null,
    tercero: l.terceros ? nombreTercero(l.terceros) : null,
    centroCosto: l.centro_costo ?? null,
    debito: Number(l.debito) || 0,
    credito: Number(l.credito) || 0,
  }))
}

const esAnterior = (l: LineaRep, inicio: string) => l.tipo === 'CA' || l.fecha < inicio
const enPeriodo  = (l: LineaRep, inicio: string, fin: string) => l.tipo !== 'CA' && l.fecha >= inicio && l.fecha <= fin

// ── Balance de comprobación (y base del ESF): saldo anterior / mov / final ─────
export type SaldoPeriodo = {
  cuenta: string; nombre: string; naturaleza: string; clase: string
  saldoAnterior: number; debitoPeriodo: number; creditoPeriodo: number; saldoFinal: number
}

export function saldosDesdeLineas(lineas: LineaRep[], periodo: string): SaldoPeriodo[] {
  const inicio = `${periodo}-01`, fin = ultimoDiaMes(periodo)
  const acc = new Map<string, { nombre: string; nat: string; antD: number; antC: number; perD: number; perC: number }>()
  for (const l of lineas) {
    let a = acc.get(l.cuenta)
    if (!a) { a = { nombre: l.nombre, nat: l.naturaleza, antD: 0, antC: 0, perD: 0, perC: 0 }; acc.set(l.cuenta, a) }
    if (esAnterior(l, inicio)) { a.antD += l.debito; a.antC += l.credito }
    else if (enPeriodo(l, inicio, fin)) { a.perD += l.debito; a.perC += l.credito }
  }
  return [...acc.entries()].map(([cuenta, a]) => ({
    cuenta, nombre: a.nombre, naturaleza: a.nat, clase: cuenta.charAt(0),
    saldoAnterior: saldoNaturaleza(a.nat, a.antD, a.antC),
    debitoPeriodo: a.perD, creditoPeriodo: a.perC,
    saldoFinal: saldoNaturaleza(a.nat, a.antD + a.perD, a.antC + a.perC),
  })).sort((x, y) => x.cuenta.localeCompare(y.cuenta))
}

// ── Libro Mayor / auxiliar por cuenta y TERCERO (Bug A) ───────────────────────
// Regla general: si la cuenta exige_tercero, se subdivide por tercero (cada uno con
// su saldo anterior + movimientos + saldo corriente). Si no, un solo grupo "—".
export type MovMayorRep = {
  fecha: string; comprobante: string; tipo: string; descripcion: string; docSoporte: string | null
  centroCosto: string | null; debito: number; credito: number; saldoCorriente: number; esApertura: boolean
}
export type GrupoTercero = {
  tercero: string; terceroNit: string | null
  saldoAnterior: number; movimientos: MovMayorRep[]; saldoFinal: number
}
export type CuentaMayorRep = {
  cuenta: string; nombre: string; naturaleza: string; exigeTercero: boolean
  grupos: GrupoTercero[]; saldoFinal: number
}

export function mayorDesdeLineas(lineas: LineaRep[], periodo: string): CuentaMayorRep[] {
  const inicio = `${periodo}-01`, fin = ultimoDiaMes(periodo)
  // agrupar cuenta → clave de tercero
  const cuentas = new Map<string, { nombre: string; nat: string; exigeT: boolean; porTercero: Map<string, { tercero: string; nit: string | null; lineas: LineaRep[] }> }>()
  for (const l of lineas) {
    if (!(esAnterior(l, inicio) || enPeriodo(l, inicio, fin))) continue
    let c = cuentas.get(l.cuenta)
    if (!c) { c = { nombre: l.nombre, nat: l.naturaleza, exigeT: l.exigeTercero, porTercero: new Map() }; cuentas.set(l.cuenta, c) }
    const clave = c.exigeT ? (l.terceroId ?? l.terceroNit ?? l.tercero ?? 'sin-tercero') : '—'
    let g = c.porTercero.get(clave)
    if (!g) { g = { tercero: c.exigeT ? (l.tercero ?? 'Sin tercero') : '—', nit: null, lineas: [] }; c.porTercero.set(clave, g) }
    // NIT solo para cuentas que manejan tercero; en el grupo "—" NO heredar el NIT de
    // una línea suelta (p.ej. caja de apertura por tercero) — mostraría un NIT cruzado.
    if (c.exigeT && !g.nit && l.terceroNit) g.nit = l.terceroNit
    g.lineas.push(l)
  }

  const ordenar = (a: LineaRep, b: LineaRep) => {
    const ax = a.tipo === 'CA' ? 0 : 1, bx = b.tipo === 'CA' ? 0 : 1
    return ax - bx || a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo) || a.consecutivo - b.consecutivo
  }
  const aporte = (nat: string, l: LineaRep) => nat === 'DEBITO' ? l.debito - l.credito : l.credito - l.debito

  const out: CuentaMayorRep[] = []
  for (const [cuenta, c] of cuentas) {
    const grupos: GrupoTercero[] = []
    for (const [, g] of c.porTercero) {
      const ants = g.lineas.filter(l => esAnterior(l, inicio))
      const pers = g.lineas.filter(l => enPeriodo(l, inicio, fin)).sort(ordenar)
      const saldoAnterior = ants.reduce((s, l) => s + aporte(c.nat, l), 0)
      let saldo = saldoAnterior
      const movimientos: MovMayorRep[] = pers.map(l => {
        saldo += aporte(c.nat, l)
        return {
          fecha: l.fecha, comprobante: l.comprobante, tipo: l.tipo, descripcion: l.descripcion, docSoporte: l.docSoporte,
          centroCosto: l.centroCosto, debito: l.debito, credito: l.credito, saldoCorriente: saldo, esApertura: false,
        }
      })
      grupos.push({ tercero: g.tercero, terceroNit: g.nit, saldoAnterior, movimientos, saldoFinal: saldo })
    }
    grupos.sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
    out.push({
      cuenta, nombre: c.nombre, naturaleza: c.nat, exigeTercero: c.exigeT,
      grupos, saldoFinal: grupos.reduce((s, g) => s + g.saldoFinal, 0),
    })
  }
  return out.sort((a, b) => a.cuenta.localeCompare(b.cuenta))
}

// ── Libro Diario del periodo (asientos con fecha en el mes; CA-1 incluido) ─────
export type AsientoRep = {
  comprobante: string; tipo: string; fecha: string; descripcion: string
  lineas: { cuenta: string; nombre: string; tercero: string | null; terceroNit: string | null; centroCosto: string | null; docSoporte: string | null; debito: number; credito: number }[]
  totalDebito: number; totalCredito: number
}
export function diarioDesdeLineas(lineas: LineaRep[], periodo: string): AsientoRep[] {
  const inicio = `${periodo}-01`, fin = ultimoDiaMes(periodo)
  // asientos con fecha dentro del mes (CA-1, fechado el 1, entra como primer asiento)
  const dentro = lineas.filter(l => l.fecha >= inicio && l.fecha <= fin)
  const byEntry = new Map<string, AsientoRep>()
  for (const l of dentro) {
    const key = l.comprobante
    let a = byEntry.get(key)
    if (!a) { a = { comprobante: l.comprobante, tipo: l.tipo, fecha: l.fecha, descripcion: l.descripcion, lineas: [], totalDebito: 0, totalCredito: 0 }; byEntry.set(key, a) }
    a.lineas.push({ cuenta: l.cuenta, nombre: l.nombre, tercero: l.tercero, terceroNit: l.terceroNit, centroCosto: l.centroCosto, docSoporte: l.docSoporte, debito: l.debito, credito: l.credito })
    a.totalDebito += l.debito; a.totalCredito += l.credito
  }
  const asientos = [...byEntry.values()]
  for (const a of asientos) a.lineas.sort((x, y) => (x.credito > 0 ? 1 : 0) - (y.credito > 0 ? 1 : 0))
  return asientos.sort((a, b) =>
    (a.tipo === 'CA' ? 0 : 1) - (b.tipo === 'CA' ? 0 : 1) ||
    a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo) || a.comprobante.localeCompare(b.comprobante))
}

// ── Paquete completo para el hub / export ─────────────────────────────────────
export type ReportesContador = {
  periodo: string; corte: string
  diario: AsientoRep[]
  mayor: CuentaMayorRep[]
  balance: SaldoPeriodo[]
  esf: { activo: SaldoPeriodo[]; pasivo: SaldoPeriodo[]; patrimonio: SaldoPeriodo[]; totalActivo: number; totalPasivo: number; totalPatrimonio: number; utilidad: number }
  eri: {
    ingresosOper: SaldoPeriodo[]; costos: SaldoPeriodo[]; gastosOper: SaldoPeriodo[]
    erogSocios: SaldoPeriodo[]; ingresosFin: SaldoPeriodo[]; gastosFin: SaldoPeriodo[]
    totalIngresosOper: number; totalCostos: number; totalGastosOper: number
    totalErogSocios: number; totalIngresosFin: number; totalGastosFin: number
    utilidadBruta: number; utilidadOperacional: number; utilidad: number
  }
}

// Monto de presentación con signo natural del grupo (activo/costo/gasto = D−C; pasivo/pat/ing = C−D)
const montoGrupo = (s: SaldoPeriodo, esResultado = false) => {
  const clase = s.cuenta.charAt(0)
  const debitNat = clase === '1' || clase === '5' || clase === '6' || clase === '7'
  if (esResultado) return debitNat ? s.debitoPeriodo - s.creditoPeriodo : s.creditoPeriodo - s.debitoPeriodo
  return s.saldoFinal
}

export async function reportesContador(periodo: string): Promise<ReportesContador> {
  const corte = ultimoDiaMes(periodo)
  const inicio = `${periodo}-01`
  const lineas = await fetchLineasReporte(corte)

  const diario  = diarioDesdeLineas(lineas, periodo)
  const mayor   = mayorDesdeLineas(lineas, periodo)
  const balance = saldosDesdeLineas(lineas, periodo)

  // ── ESF: cuentas de balance (clase 1/2/3), saldo final acumulado ──
  let activo       = balance.filter(b => b.clase === '1')
  let pasivo       = balance.filter(b => b.clase === '2')
  const patrimonio = balance.filter(b => b.clase === '3')

  // 13301510 Anticipo a trabajadores: NO compensar — el saldo DEUDOR (conductores a los que
  // se les adelantó) va al activo; el ACREEDOR (conductores que le deben a la empresa) al
  // pasivo. Se separa por tercero, sin netear entre conductores.
  const ANTIC = '13301510'
  const antLine = activo.find(b => b.cuenta === ANTIC)
  if (antLine) {
    const split = (soloAnterior: boolean) => {
      const m = new Map<string, number>()
      for (const l of lineas) {
        if (l.cuenta !== ANTIC) continue
        if (soloAnterior && !(l.tipo === 'CA' || l.fecha < inicio)) continue
        const k = l.terceroId ?? l.terceroNit ?? '—'
        m.set(k, (m.get(k) ?? 0) + l.debito - l.credito)
      }
      let deudor = 0, acreedor = 0
      for (const v of m.values()) { if (v > 0) deudor += v; else acreedor += -v }
      return { deudor, acreedor }
    }
    const fin = split(false), ant = split(true)
    activo = activo.filter(b => b.cuenta !== ANTIC)
    activo.push({ cuenta: ANTIC, nombre: `${antLine.nombre} (saldo deudor)`, naturaleza: 'DEBITO', clase: '1',
      saldoAnterior: ant.deudor, debitoPeriodo: 0, creditoPeriodo: 0, saldoFinal: fin.deudor })
    // El saldo ACREEDOR se conserva bajo el MISMO código 13301510 (no se inventa una cuenta 23):
    // es una desagregación de presentación. La nota al pie del ESF lo explica y aclara que el
    // Balance de Comprobación muestra esta cuenta consolidada en su saldo neto.
    pasivo = [...pasivo, { cuenta: ANTIC, nombre: `${antLine.nombre} (saldo acreedor)`, naturaleza: 'CREDITO', clase: '2',
      saldoAnterior: ant.acreedor, debitoPeriodo: 0, creditoPeriodo: 0, saldoFinal: fin.acreedor }]
  }
  activo.sort((x, y) => x.cuenta.localeCompare(y.cuenta))
  pasivo.sort((x, y) => x.cuenta.localeCompare(y.cuenta))
  const totalActivo     = activo.reduce((s, b) => s + b.saldoFinal, 0)
  const totalPasivo     = pasivo.reduce((s, b) => s + b.saldoFinal, 0)
  const totalPatrimonio = patrimonio.reduce((s, b) => s + b.saldoFinal, 0)

  // ── ERI: separa operacional de financiero, con utilidad bruta y operacional ──
  //   41 ingreso operacional · 42 ingreso financiero/no oper · 6-7 costos ·
  //   51/52/… gasto operacional · 53 gasto financiero/no oper.
  //   5297xx (gastos personales) se saca a un bloque aparte DESPUÉS de la utilidad
  //   operacional ("Erogaciones a favor de los socios"), para que la utilidad
  //   operacional refleje solo la operación real y sea un número utilizable.
  const sub = (b: SaldoPeriodo) => b.cuenta.slice(0, 2)
  // Erogaciones a favor de los socios: familia 5297xx + 52959510/52959511 (también gasto
  // personal del socio, no operativo — señalado por el revisor).
  const EROG_EXTRA = new Set(['52959510', '52959511'])
  const esErogSocio  = (b: SaldoPeriodo) => b.cuenta.startsWith('5297') || EROG_EXTRA.has(b.cuenta)
  const ingresosOper = balance.filter(b => sub(b) === '41')
  const ingresosFin  = balance.filter(b => b.clase === '4' && sub(b) !== '41')
  const costos       = balance.filter(b => b.clase === '6' || b.clase === '7')
  const gastosFin    = balance.filter(b => sub(b) === '53')
  const erogSocios   = balance.filter(esErogSocio)
  const gastosOper   = balance.filter(b => b.clase === '5' && sub(b) !== '53' && !esErogSocio(b))
  const sumMov = (arr: SaldoPeriodo[]) => arr.reduce((s, b) => s + montoGrupo(b, true), 0)
  const totalIngresosOper = sumMov(ingresosOper), totalIngresosFin = sumMov(ingresosFin)
  const totalCostos = sumMov(costos), totalGastosOper = sumMov(gastosOper), totalGastosFin = sumMov(gastosFin)
  const totalErogSocios = sumMov(erogSocios)
  const utilidadBruta       = totalIngresosOper - totalCostos
  const utilidadOperacional = utilidadBruta - totalGastosOper
  // La utilidad del ejercicio no cambia: las erogaciones a socios siguen restando, solo se reubican.
  const utilidad            = utilidadOperacional - totalErogSocios + totalIngresosFin - totalGastosFin

  return {
    periodo, corte, diario, mayor, balance,
    esf: { activo, pasivo, patrimonio, totalActivo, totalPasivo, totalPatrimonio, utilidad },
    eri: {
      ingresosOper, costos, gastosOper, erogSocios, ingresosFin, gastosFin,
      totalIngresosOper, totalCostos, totalGastosOper, totalErogSocios, totalIngresosFin, totalGastosFin,
      utilidadBruta, utilidadOperacional, utilidad,
    },
  }
}
