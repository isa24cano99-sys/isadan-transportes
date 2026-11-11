import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import { calcularImpuestoLibro, type LineaImpuesto } from '@/lib/impuesto-simple'
import ImpuestoClient from './ImpuestoClient'

export type ReservaPendiente = {
  id: string
  fecha: string
  monto: number
  socio: string
  descripcion: string
}

export type ReservaVigente = {
  terceroId: string
  socio: string
  reservado: number
}

// Línea contabilizada de 13251005 con su fecha, para calcular el disponible de
// reserva de un socio A UNA FECHA dada (suma de netos con fecha ≤ fecha elegida).
export type ReservaLineaFecha = {
  terceroId: string
  fecha: string
  neto: number
}

// Egreso bancario aún sin asiento, para enlazar la parte pagada con banco.
export type EgresoBanco = {
  id: string
  fecha: string
  monto: number
  descripcion: string
}

// Datos de las 2 secciones de "Reserva para impuestos (custodia socio)".
// - Pendientes: movimientos de banco categorizados 13251005 sin asiento CB aún.
// - Vigentes: saldo de 13251005 por socio (DB-CR, contabilizado) > 0.
// - saldo241215: impuesto causado disponible para cerrar contra (CR-DB, contabilizado).
async function getReservaData(): Promise<{
  pendientes: ReservaPendiente[]
  vigentes: ReservaVigente[]
  saldo241215: number
  reservaLineas: ReservaLineaFecha[]
  egresos: EgresoBanco[]
}> {
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '13251005').limit(1).maybeSingle()

  // Pendientes de contabilizar
  let pendientes: ReservaPendiente[] = []
  if (cat) {
    const { data: cb } = await supabase
      .from('journal_entries').select('origen_id')
      .eq('origen_tabla', 'bank_transactions').eq('tipo_comprobante', 'CB').eq('estado', 'CONTABILIZADO')
    const conCB = new Set((cb ?? []).map(x => x.origen_id))

    const bts = await fetchAll<any>((from, to) => supabase
      .from('bank_transactions')
      .select('id, date, amount, description, tercero_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona)')
      .eq('category_id', cat.id)
      .gte('date', '2026-07-01')
      .order('date').order('id', { ascending: true }).range(from, to))

    pendientes = bts
      .filter((b: any) => !conCB.has(b.id))
      .map((b: any) => ({
        id:          b.id,
        fecha:       b.date as string,
        monto:       Number(b.amount),
        socio:       b.terceros ? nombreTercero(b.terceros) : '— sin socio —',
        descripcion: (b.description ?? '') as string,
      }))
  }

  // Reservas vigentes por socio (saldo 13251005 débito, contabilizado) + líneas con fecha
  const lineasReserva = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('debito, credito, tercero_id, tercero_nombre_snapshot, journal_entries!inner(estado, fecha)')
    .eq('cuenta_puc', '13251005')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .range(from, to))

  const porSocio = new Map<string, { socio: string; reservado: number }>()
  const reservaLineas: ReservaLineaFecha[] = []
  for (const l of lineasReserva) {
    if (!l.tercero_id) continue
    const neto = Number(l.debito ?? 0) - Number(l.credito ?? 0)
    const prev = porSocio.get(l.tercero_id) ?? { socio: l.tercero_nombre_snapshot ?? '—', reservado: 0 }
    prev.reservado += neto
    porSocio.set(l.tercero_id, prev)
    reservaLineas.push({ terceroId: l.tercero_id, fecha: (l.journal_entries?.fecha ?? '') as string, neto })
  }
  const vigentes: ReservaVigente[] = [...porSocio.entries()]
    .map(([terceroId, v]) => ({ terceroId, socio: v.socio, reservado: v.reservado }))
    .filter(v => v.reservado > 0)
    .sort((a, b) => b.reservado - a.reservado)

  // Saldo causado en 241215 (crédito, contabilizado)
  const lineas241215 = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('debito, credito, journal_entries!inner(estado)')
    .eq('cuenta_puc', '241215')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .range(from, to))
  const saldo241215 = lineas241215.reduce(
    (s: number, l: any) => s + Number(l.credito ?? 0) - Number(l.debito ?? 0), 0)

  // Egresos bancarios aún sin asiento, para enlazar la parte pagada con banco.
  const { data: conOrigen } = await supabase
    .from('journal_entries').select('origen_id')
    .eq('origen_tabla', 'bank_transactions').eq('estado', 'CONTABILIZADO')
  const yaConAsiento = new Set((conOrigen ?? []).map(x => x.origen_id))
  const egresosBt = await fetchAll<any>((from, to) => supabase
    .from('bank_transactions')
    .select('id, date, amount, description')
    .eq('type', 'EGRESO')
    .gte('date', '2026-07-01')
    .order('date', { ascending: false }).order('id', { ascending: true }).range(from, to))
  const egresos: EgresoBanco[] = egresosBt
    .filter((b: any) => !yaConAsiento.has(b.id))
    .map((b: any) => ({ id: b.id, fecha: b.date as string, monto: Number(b.amount), descripcion: (b.description ?? '') as string }))

  return { pendientes, vigentes, saldo241215, reservaLineas, egresos }
}

export default async function ImpuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()

  // Todo sale del LIBRO (asientos CONTABILIZADOS): ingresos 41xx (neto de notas crédito),
  // pensión empresa 52057010 y causación 54050505/54050510 del año elegido, y el pasivo 241215
  // de todos los años (para aplicar los pagos al impuesto más antiguo).
  const lineasLibro = (filtro: (q: any) => any, soloAnio: boolean) => fetchAll<any>((f, t) => {
    let q = supabase
      .from('journal_entry_lines')
      .select('cuenta_puc, debito, credito, journal_entries!inner(estado, fecha, tipo_comprobante)')
      .eq('journal_entries.estado', 'CONTABILIZADO')
    q = filtro(q)
    if (soloAnio) q = q.gte('journal_entries.fecha', `${year}-01-01`).lte('journal_entries.fecha', `${year}-12-31`)
    return q.order('id', { ascending: true }).range(f, t)
  })

  const [ingresosRows, otrasRows, pasivoRows, reserva] = await Promise.all([
    lineasLibro(q => q.like('cuenta_puc', '41%'), true),
    lineasLibro(q => q.in('cuenta_puc', ['52057010', '54050505', '54050510']), true),
    lineasLibro(q => q.eq('cuenta_puc', '241215'), false),
    getReservaData(),
  ])

  const lineas: LineaImpuesto[] = [...ingresosRows, ...otrasRows, ...pasivoRows].map((l: any) => ({
    cuenta:  l.cuenta_puc as string,
    fecha:   (l.journal_entries?.fecha ?? '') as string,
    tipo:    (l.journal_entries?.tipo_comprobante ?? '') as string,
    debito:  Number(l.debito ?? 0),
    credito: Number(l.credito ?? 0),
  })).filter(l => l.fecha)
  const impuesto = calcularImpuestoLibro(year, lineas)

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6">
      <ImpuestoClient
        year={year}
        availableYears={availableYears}
        bimestres={impuesto.bimestres}
        aperturaSaldo={impuesto.aperturaSaldo}
        reservasPendientes={reserva.pendientes}
        reservasVigentes={reserva.vigentes}
        saldo241215={reserva.saldo241215}
        reservaLineas={reserva.reservaLineas}
        egresos={reserva.egresos}
      />
    </div>
  )
}
