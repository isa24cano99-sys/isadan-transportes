// Historia mensual de nómina, leída del LIBRO. Solo servidor (usa la service key).
// Para cada mes junta lo que pasó: nómina causada (CN), pago del neto (CB), consolidación de
// seguridad social (CG), pago de la PILA (CB) y pagos de prestaciones, cada uno con su asiento.
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'

export type LineaAsiento = {
  cuenta: string
  nombre: string
  tercero: string
  debito: number
  credito: number
}

export type EventoTipo =
  | 'NOMINA' | 'PAGO_NETO' | 'SS_CONSOLIDADA' | 'PAGO_PILA' | 'PAGO_PRESTACION' | 'REVERSION'

export type EventoNomina = {
  id: string
  tipo: EventoTipo
  fecha: string
  comprobante: string          // CN-15, CB-226…
  descripcion: string
  soporte: string
  tercero: string              // conductor / entidad principal del asiento
  monto: number                // lo que ese evento mueve (ver `detalle`)
  detalle: string
  lineas: LineaAsiento[]
}

export type MesNomina = {
  mes: string                  // YYYY-MM
  causado: number              // total devengado + aportes + provisiones (débitos de los CN del mes)
  netoCausado: number          // lo acreditado a 250505
  netoPagado: number
  ssConsolidada: number
  pilaPagada: number
  prestacionesPagadas: number
  sinCausar: string[]          // conductores activos sin CN en ese mes (solo meses ya cerrados)
  eventos: EventoNomina[]
}

export type HistoriaNomina = {
  meses: MesNomina[]
  netoPendiente: number        // saldo 250505
  pilaPendiente: number        // saldo 23709510
  provisiones: { cuenta: string; nombre: string; saldo: number }[]
}

const PRESTACIONES = ['251015', '251510', '252010', '252510']
const CUENTAS_CLAVE = ['250505', '23709510', ...PRESTACIONES]
const CHUNK = 80

export async function getHistoriaNomina(): Promise<HistoriaNomina> {
  // 1) Líneas de las cuentas clave (todas las fechas) → saldos y universo de asientos
  const claves = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('journal_entry_id, cuenta_puc, debito, credito, journal_entries!inner(estado, tipo_comprobante)')
    .in('cuenta_puc', CUENTAS_CLAVE)
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))

  const saldos = new Map<string, number>()
  const ids = new Set<string>()
  for (const l of claves) {
    const debito = Number(l.debito ?? 0), credito = Number(l.credito ?? 0)
    // 250505 y 23709510 son pasivos (CR − DB); idem prestaciones consolidadas
    saldos.set(l.cuenta_puc, (saldos.get(l.cuenta_puc) ?? 0) + credito - debito)
    if (l.journal_entries?.tipo_comprobante !== 'CA') ids.add(l.journal_entry_id)
  }

  // 2) Asientos de causación de nómina y de consolidación de SS (por si algún mes no toca esas cuentas)
  const [{ data: cn }, { data: ss }] = await Promise.all([
    supabase.from('journal_entries').select('id').eq('tipo_comprobante', 'CN').eq('estado', 'CONTABILIZADO'),
    supabase.from('journal_entries').select('id').eq('origen_tabla', 'consolidacion_ss').eq('estado', 'CONTABILIZADO'),
  ])
  for (const e of [...(cn ?? []), ...(ss ?? [])]) ids.add(e.id as string)

  // 3) Cada asiento con sus líneas (por lotes, para no pasar de la longitud de URL)
  const lista = [...ids]
  const asientos: any[] = []
  for (let i = 0; i < lista.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, tipo_comprobante, consecutivo, fecha, descripcion, documento_soporte, origen_tabla, journal_entry_lines(cuenta_puc, debito, credito, tercero_id, tercero_nombre_snapshot)')
      .in('id', lista.slice(i, i + CHUNK))
      .eq('estado', 'CONTABILIZADO')
    if (error) throw error
    asientos.push(...(data ?? []))
  }

  // Nombres de cuenta
  const codigos = new Set<string>(CUENTAS_CLAVE)
  for (const a of asientos) for (const l of a.journal_entry_lines ?? []) codigos.add(l.cuenta_puc)
  const { data: puc } = await supabase.from('puc_accounts').select('codigo, nombre').in('codigo', [...codigos])
  const nombre = new Map((puc ?? []).map(p => [p.codigo as string, p.nombre as string]))

  // 4) Clasificar y agrupar por mes
  const meses = new Map<string, MesNomina>()
  const mes = (m: string): MesNomina => {
    let x = meses.get(m)
    if (!x) {
      x = { mes: m, causado: 0, netoCausado: 0, netoPagado: 0, ssConsolidada: 0, pilaPagada: 0,
            prestacionesPagadas: 0, sinCausar: [], eventos: [] }
      meses.set(m, x)
    }
    return x
  }
  const causadosPorMes = new Map<string, Set<string>>()   // mes → tercero_id de conductores con CN

  for (const a of asientos) {
    const lineas: LineaAsiento[] = (a.journal_entry_lines ?? []).map((l: any) => ({
      cuenta: l.cuenta_puc as string,
      nombre: nombre.get(l.cuenta_puc) ?? '',
      tercero: (l.tercero_nombre_snapshot ?? '') as string,
      debito: Number(l.debito ?? 0),
      credito: Number(l.credito ?? 0),
    })).sort((x: LineaAsiento, y: LineaAsiento) => x.cuenta.localeCompare(y.cuenta))

    const sum = (cuenta: string, lado: 'debito' | 'credito') =>
      lineas.filter(l => l.cuenta === cuenta).reduce((s, l) => s + l[lado], 0)
    const terceroDe = (cuenta: string) => lineas.find(l => l.cuenta === cuenta && l.tercero)?.tercero ?? ''
    const m = mes(String(a.fecha).slice(0, 7))
    const base = {
      id: a.id as string,
      fecha: a.fecha as string,
      comprobante: `${a.tipo_comprobante}-${a.consecutivo}`,
      descripcion: (a.descripcion ?? '') as string,
      soporte: (a.documento_soporte ?? '') as string,
      lineas,
    }
    const totalDebito = lineas.reduce((s, l) => s + l.debito, 0)
    const prestDebito = PRESTACIONES.reduce((s, c) => s + sum(c, 'debito'), 0)

    if (a.tipo_comprobante === 'CN') {
      const neto = sum('250505', 'credito')
      const quien = terceroDe('250505')
      m.causado += totalDebito
      m.netoCausado += neto
      const idConductor = (a.journal_entry_lines ?? []).find((l: any) => l.cuenta_puc === '250505' && l.tercero_id)?.tercero_id as string | undefined
      if (idConductor) {
        const set = causadosPorMes.get(m.mes) ?? new Set<string>()
        set.add(idConductor); causadosPorMes.set(m.mes, set)
      }
      m.eventos.push({ ...base, tipo: 'NOMINA', tercero: quien, monto: totalDebito,
        detalle: `Neto a pagar ${fmt(neto)} · el resto son aportes, provisiones y retenciones` })
    } else if (a.origen_tabla === 'consolidacion_ss') {
      const v = sum('23709510', 'credito')
      m.ssConsolidada += v
      m.eventos.push({ ...base, tipo: 'SS_CONSOLIDADA', tercero: 'Aportes en Línea', monto: v,
        detalle: 'Aportes de EPS, ARL, caja y fondo juntos en un solo pasivo' })
    } else if (a.tipo_comprobante === 'RV') {
      m.eventos.push({ ...base, tipo: 'REVERSION', tercero: '', monto: totalDebito / 2,
        detalle: 'Reversión de un asiento anterior' })
    } else if (sum('250505', 'debito') > 0) {
      const v = sum('250505', 'debito')
      m.netoPagado += v
      m.eventos.push({ ...base, tipo: 'PAGO_NETO', tercero: terceroDe('250505'), monto: v,
        detalle: 'Pago del neto al conductor desde el banco' })
    } else if (sum('23709510', 'debito') > 0) {
      const v = sum('23709510', 'debito')
      m.pilaPagada += v
      m.eventos.push({ ...base, tipo: 'PAGO_PILA', tercero: 'Aportes en Línea', monto: v,
        detalle: 'Pago de la PILA desde el banco' })
    } else if (prestDebito > 0) {
      m.prestacionesPagadas += prestDebito
      m.eventos.push({ ...base, tipo: 'PAGO_PRESTACION', tercero: terceroDe(PRESTACIONES.find(c => sum(c, 'debito') > 0) ?? ''), monto: prestDebito,
        detalle: 'Pago de prestaciones (cesantías, intereses, prima o vacaciones)' })
    }
  }

  // 5) Meses ya cerrados sin nómina de algún conductor activo (desde julio 2026)
  const { data: drivers } = await supabase
    .from('drivers').select('full_name, salary, tercero_id').eq('active', true).not('tercero_id', 'is', null)
  const conductores = (drivers ?? []).filter(d => Number(d.salary ?? 0) > 0)
    .map(d => ({ id: d.tercero_id as string, nombre: d.full_name as string }))
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  let y = 2026, mm = 7
  for (;;) {
    const clave = `${y}-${String(mm).padStart(2, '0')}`
    if (clave > mesActual) break
    const x = mes(clave)
    if (clave < mesActual) {
      const con = causadosPorMes.get(clave) ?? new Set<string>()
      x.sinCausar = conductores.filter(c => !con.has(c.id)).map(c => c.nombre)
    }
    mm++
    if (mm > 12) { mm = 1; y++ }
  }

  const ordenados = [...meses.values()]
    .map(x => ({ ...x, eventos: x.eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.comprobante.localeCompare(b.comprobante)) }))
    .sort((a, b) => b.mes.localeCompare(a.mes))

  return {
    meses: ordenados,
    netoPendiente: Math.round(saldos.get('250505') ?? 0),
    pilaPendiente: Math.round(saldos.get('23709510') ?? 0),
    provisiones: PRESTACIONES.map(c => ({ cuenta: c, nombre: nombre.get(c) ?? c, saldo: Math.round(saldos.get(c) ?? 0) })),
  }
}

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO')
