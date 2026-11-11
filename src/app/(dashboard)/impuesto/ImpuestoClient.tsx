'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import {
  causarImpuestoAction, registrarReservaAction, cerrarReservaAction, postearPagoImpuestoAction,
} from './actions'
import { formatCOP } from '@/lib/utils'
import type { BimestreLibro, EstadoImpuesto } from '@/lib/impuesto-simple'
import type {
  ReservaPendiente, ReservaVigente, ReservaLineaFecha, EgresoBanco,
} from './page'

// ── Constants ──────────────────────────────────────────────────────────────────

const RST_RATE = 0.031   // 3.1% — Sector Transporte, tarifa fija aplicada
const ICA_RATE = 0.0115  // 11.5‰ — municipio de Bello (1.15%)

const BIM_META = [
  { num: 1, title: 'Bimestre 1', months: 'Enero / Febrero',           dueMonth: 5,  dueDay: 26 },
  { num: 2, title: 'Bimestre 2', months: 'Marzo / Abril',             dueMonth: 6,  dueDay: 24 },
  { num: 3, title: 'Bimestre 3', months: 'Mayo / Junio',              dueMonth: 7,  dueDay: 23 },
  { num: 4, title: 'Bimestre 4', months: 'Julio / Agosto',            dueMonth: 9,  dueDay: 22 },
  { num: 5, title: 'Bimestre 5', months: 'Septiembre / Octubre',      dueMonth: 11, dueDay: 25 },
  { num: 6, title: 'Bimestre 6', months: 'Noviembre / Diciembre',     dueMonth: 1,  dueDay: 26, nextYear: true },
] as const


const ESTADO_META: Record<EstadoImpuesto, { label: string; cls: string }> = {
  SIN_CAUSAR: { label: 'Sin causar',     cls: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]' },
  PENDIENTE:  { label: 'Por pagar',      cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  PARCIAL:    { label: 'Pago parcial',   cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  PAGADO:     { label: '✓ Pagado',       cls: 'bg-green-50 text-green-700 border-green-200' },
}
// ── Helpers ────────────────────────────────────────────────────────────────────

function getDueDate(year: number, meta: (typeof BIM_META)[number]): string {
  const y = 'nextYear' in meta && meta.nextYear ? year + 1 : year
  return `${y}-${String(meta.dueMonth).padStart(2, '0')}-${String(meta.dueDay).padStart(2, '0')}`
}

function getDaysLeft(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dateStr + 'T00:00:00')
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function dueBadge(days: number): { label: string; cls: string } {
  if (days < 0)  return { label: `Venció hace ${Math.abs(days)} días`,  cls: 'bg-[#F1F5F9] text-[#94A3B8]' }
  if (days < 15) return { label: `Vence en ${days} días`,              cls: 'bg-red-100 text-red-700' }
  if (days < 30) return { label: `Vence en ${days} días`,              cls: 'bg-yellow-100 text-yellow-700' }
  return           { label: `Vence en ${days} días`,                   cls: 'bg-green-100 text-green-700' }
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Row({
  label, value, sub = false, bold = false,
}: {
  label: string; value: number; sub?: boolean; bold?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${sub ? 'opacity-60' : ''}`}>
      <span className={`flex-1 ${sub ? 'text-xs pl-3 text-[#64748B]' : bold ? 'text-sm font-semibold text-[#0F172A]' : 'text-sm text-[#64748B]'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${sub ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold text-[#0F172A]' : 'text-[#0F172A]'}`}>
        {value === 0 ? '—' : formatCOP(value)}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-[#E2E8F0] my-1" />
}

// ── Sección C · Registrar pago del impuesto (DIAN) ──────────────────────────────
// UN solo asiento CG: DB 241215 (total−mora) + DB 53959510 (mora) / CR 13251005
// (reserva socio) + CR 110505 (caja) + CR 11100510 (banco). El disponible de la
// reserva se calcula A LA FECHA elegida y se recalcula si la fecha cambia.
function PagoImpuestoSection({
  reservasVigentes, saldo241215, reservaLineas, egresos, onDone,
}: {
  reservasVigentes: ReservaVigente[]
  saldo241215: number
  reservaLineas: ReservaLineaFecha[]
  egresos: EgresoBanco[]
  onDone: () => void
}) {
  const [fecha,   setFecha]   = useState('')
  const [total,   setTotal]   = useState('')
  const [mora,    setMora]    = useState('')
  const [reserva, setReserva] = useState('')
  const [caja,    setCaja]    = useState('')
  const [banco,   setBanco]   = useState('')
  const [bankTx,  setBankTx]  = useState('')
  const [recibo,  setRecibo]  = useState('')
  const [socio,   setSocio]   = useState(reservasVigentes[0]?.terceroId ?? '')
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState('')
  const [ok,      setOk]      = useState('')

  const n = (s: string) => Math.round(parseFloat(s) || 0)
  const vTotal = n(total), vMora = n(mora), vReserva = n(reserva), vCaja = n(caja), vBanco = n(banco)
  const sumaFuentes = vReserva + vCaja + vBanco
  const abono       = vTotal - vMora       // lo que abona al pasivo 241215

  // Disponible de reserva del socio A LA FECHA elegida (suma de netos con fecha ≤ fecha).
  const dispReserva = useMemo(() => {
    if (!socio || !fecha) return null
    return reservaLineas
      .filter(l => l.terceroId === socio && l.fecha && l.fecha <= fecha)
      .reduce((s, l) => s + l.neto, 0)
  }, [socio, fecha, reservaLineas])

  // Validaciones (mismas que la función SQL; aquí solo para habilitar el botón y avisar)
  const problemas: string[] = []
  if (!fecha)                              problemas.push('Elige la fecha del pago.')
  if (vTotal <= 0)                         problemas.push('El total debe ser mayor que 0.')
  if (vMora < 0 || vReserva < 0 || vCaja < 0 || vBanco < 0) problemas.push('Los montos no pueden ser negativos.')
  if (vMora >= vTotal && vTotal > 0)       problemas.push('La mora no puede ser igual o mayor al total.')
  if (vTotal > 0 && sumaFuentes !== vTotal) problemas.push(`Las fuentes (${formatCOP(sumaFuentes)}) deben sumar el total (${formatCOP(vTotal)}).`)
  if (abono > 0 && abono > saldo241215)    problemas.push(`El abono al pasivo (${formatCOP(abono)}) supera el saldo de 241215 (${formatCOP(saldo241215)}).`)
  if (vReserva > 0 && !socio)              problemas.push('Para usar reserva, elige el socio.')
  if (vReserva > 0 && dispReserva !== null && vReserva > dispReserva)
    problemas.push(`La reserva usada (${formatCOP(vReserva)}) supera lo disponible a la fecha (${formatCOP(dispReserva)}).`)
  if (vBanco > 0 && !bankTx)               problemas.push('Si usas banco, enlaza el movimiento bancario (EGRESO).')

  const puede = problemas.length === 0 && !busy

  const registrar = async () => {
    setBusy(true); setErr(''); setOk('')
    const r = await postearPagoImpuestoAction({
      fecha, total: vTotal, mora: vMora, reserva: vReserva, caja: vCaja, banco: vBanco,
      bankTransactionId: vBanco > 0 ? bankTx : null,
      terceroSocio: vReserva > 0 ? socio : null,
      recibo: recibo.trim() || null,
    })
    setBusy(false)
    if (r.ok) {
      setOk(`Contabilizado · asiento CG-${r.consecutivo}`)
      setTotal(''); setMora(''); setReserva(''); setCaja(''); setBanco(''); setBankTx(''); setRecibo('')
      onDone()
    } else {
      setErr(r.error ?? 'Error al contabilizar')
    }
  }

  const field = 'w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const lbl   = 'text-xs font-semibold text-[#64748B] mb-1 block'

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Registrar pago del impuesto</h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            UN asiento que salda el pasivo con las fuentes reales de plata:{' '}
            <span className="font-medium">DB 241215 (total − mora) · DB 53959510 (mora) / CR 13251005 (reserva socio) · CR 110505 (caja) · CR 11100510 (banco)</span>.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-[#64748B]">Saldo impuesto (241215)</p>
          <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatCOP(saldo241215)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Fecha del pago</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={field} />
        </div>
        <div>
          <label className={lbl}>Total pagado</label>
          <input type="number" min="0" step="1000" value={total} onChange={e => setTotal(e.target.value)} className={field} />
        </div>
        <div>
          <label className={lbl}>Mora (opcional)</label>
          <input type="number" min="0" step="1000" value={mora} onChange={e => setMora(e.target.value)} className={field} />
        </div>
      </div>

      <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-3 space-y-3">
        <p className="text-xs font-semibold text-[#64748B]">Fuentes de pago (deben sumar el total)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Reserva (socio)</label>
            <input type="number" min="0" step="1000" value={reserva} onChange={e => setReserva(e.target.value)} className={field} />
          </div>
          <div>
            <label className={lbl}>Caja (110505)</label>
            <input type="number" min="0" step="1000" value={caja} onChange={e => setCaja(e.target.value)} className={field} />
          </div>
          <div>
            <label className={lbl}>Banco (11100510)</label>
            <input type="number" min="0" step="1000" value={banco} onChange={e => setBanco(e.target.value)} className={field} />
          </div>
        </div>

        {vReserva > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Socio de la reserva</label>
              <select value={socio} onChange={e => setSocio(e.target.value)} className={field}>
                {reservasVigentes.length === 0 && <option value="">— sin reservas —</option>}
                {reservasVigentes.map(v => <option key={v.terceroId} value={v.terceroId}>{v.socio}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-[#64748B]">
                Disponible de reserva a la fecha:{' '}
                <span className="font-bold tabular-nums text-[#0F172A]">
                  {dispReserva === null ? '— elige fecha —' : formatCOP(dispReserva)}
                </span>
              </p>
            </div>
          </div>
        )}

        {vBanco > 0 && (
          <div>
            <label className={lbl}>Movimiento bancario (EGRESO) que financia la parte de banco</label>
            <select value={bankTx} onChange={e => setBankTx(e.target.value)} className={field}>
              <option value="">— elige el egreso —</option>
              {egresos.map(e => (
                <option key={e.id} value={e.id}>{e.fecha} · {formatCOP(e.monto)} · {e.descripcion || '—'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={lbl}>Recibo DIAN / soporte (opcional)</label>
        <input type="text" value={recibo} onChange={e => setRecibo(e.target.value)} placeholder="N.º de recibo o referencia" className={field} />
      </div>

      {problemas.length > 0 && (
        <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-0.5 list-disc list-inside">
          {problemas.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {err && <p className="text-sm text-red-600">✗ {err}</p>}
      {ok  && <p className="text-sm text-emerald-700">✓ {ok}</p>}

      <div className="flex justify-end">
        <button
          onClick={registrar}
          disabled={!puede}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {busy ? 'Contabilizando…' : 'Registrar pago del impuesto'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ImpuestoClient({
  year,
  availableYears,
  bimestres,
  aperturaSaldo,
  reservasPendientes,
  reservasVigentes,
  saldo241215,
  reservaLineas,
  egresos,
}: {
  year: number
  availableYears: number[]
  bimestres: BimestreLibro[]
  aperturaSaldo: number
  reservasPendientes: ReservaPendiente[]
  reservasVigentes: ReservaVigente[]
  saldo241215: number
  reservaLineas: ReservaLineaFecha[]
  egresos: EgresoBanco[]
}) {
  const router = useRouter()

  // Causación: cifras del formulario 2593 que se digitan por bimestre
  type FormCausa = { nacional: string; ica: string; soporte: string }
  const [formCausa, setFormCausa] = useState<Record<number, FormCausa>>({})
  const [loadingBim, setLoadingBim] = useState<number | null>(null)
  const [errors,     setErrors]     = useState<Record<number, string>>({})

  // Reserva para impuestos (custodia socio)
  const [loadingReserva, setLoadingReserva] = useState<string | null>(null)
  const [errReserva,     setErrReserva]     = useState<Record<string, string>>({})
  const [montoCierre,    setMontoCierre]    = useState<Record<string, string>>({})
  const [loadingCierre,  setLoadingCierre]  = useState<string | null>(null)
  const [errCierre,      setErrCierre]      = useState<Record<string, string>>({})

  const totalReservado = reservasVigentes.reduce((s, v) => s + v.reservado, 0)
  const hayCausado     = saldo241215 > 0

  // Valor efectivo del input de cierre: lo que el usuario escribió, o el tope por defecto.
  const montoCierreVal = (v: ReservaVigente) =>
    montoCierre[v.terceroId] ?? String(Math.min(v.reservado, saldo241215))

  const handleRegistrarReserva = async (id: string) => {
    setLoadingReserva(id)
    setErrReserva(e => ({ ...e, [id]: '' }))
    const result = await registrarReservaAction(id)
    if (result.ok) router.refresh()
    else setErrReserva(e => ({ ...e, [id]: result.error ?? 'Error al registrar' }))
    setLoadingReserva(null)
  }

  const handleCerrarReserva = async (v: ReservaVigente) => {
    const monto = Math.round(parseFloat(montoCierreVal(v)) || 0)
    setLoadingCierre(v.terceroId)
    setErrCierre(e => ({ ...e, [v.terceroId]: '' }))
    if (monto <= 0) {
      setErrCierre(e => ({ ...e, [v.terceroId]: 'Ingrese un monto > 0' })); setLoadingCierre(null); return
    }
    if (monto > v.reservado) {
      setErrCierre(e => ({ ...e, [v.terceroId]: 'El monto supera la reserva del socio' })); setLoadingCierre(null); return
    }
    if (monto > saldo241215) {
      setErrCierre(e => ({ ...e, [v.terceroId]: 'El monto supera el impuesto causado (241215)' })); setLoadingCierre(null); return
    }
    const result = await cerrarReservaAction(v.terceroId, monto)
    if (result.ok) {
      setMontoCierre(m => { const n = { ...m }; delete n[v.terceroId]; return n })  // re-siembra al tope tras refrescar
      router.refresh()
    } else {
      setErrCierre(e => ({ ...e, [v.terceroId]: result.error ?? 'Error al cerrar' }))
    }
    setLoadingCierre(null)
  }

  // Por bimestre: lo que dice el LIBRO + calendario + estimado referencial
  const bimData = useMemo(() => BIM_META.map((meta, idx) => {
    const b = bimestres[idx]
    const rstGross = Math.round(b.ingreso * RST_RATE)
    const icaEst   = Math.round(b.ingreso * ICA_RATE)
    const estimado = Math.max(icaEst, rstGross - b.pension)   // fórmula simplificada, solo referencia
    const dueDate  = getDueDate(year, meta)
    return { ...meta, ...b, estimado, dueDate, daysLeft: getDaysLeft(dueDate) }
  }), [bimestres, year])

  const totalIngreso = bimData.reduce((s, b) => s + b.ingreso, 0)
  const totalCausado = bimData.reduce((s, b) => s + b.causado, 0)
  const totalPagado  = bimData.reduce((s, b) => s + b.pagado, 0)

  const campo = (n: number): FormCausa => formCausa[n] ?? { nacional: '', ica: '', soporte: '' }
  const setCampo = (n: number, patch: Partial<FormCausa>) =>
    setFormCausa(f => ({ ...f, [n]: { ...campo(n), ...patch } }))

  const handleCausar = async (n: number) => {
    const f = campo(n)
    setLoadingBim(n)
    setErrors(e => ({ ...e, [n]: '' }))
    const r = await causarImpuestoAction({
      anio: year, bimestre: n,
      nacional: Math.round(parseFloat(f.nacional) || 0),
      ica:      Math.round(parseFloat(f.ica) || 0),
      soporte:  f.soporte.trim(),
    })
    if (r.ok) {
      setFormCausa(x => { const c = { ...x }; delete c[n]; return c })
      router.refresh()
    } else {
      setErrors(e => ({ ...e, [n]: r.error ?? 'Error al causar el impuesto' }))
    }
    setLoadingBim(null)
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Impuesto SIMPLE / RST</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Régimen Simple de Tributación — Sector Transporte</p>
        </div>
        <select
          value={year}
          onChange={e => router.push(`/impuesto?año=${e.target.value}`)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm font-medium text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Resumen del año — todo sale del libro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Ingresos del año</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalIngreso)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Cuentas 41xx, neto de notas crédito</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Impuesto causado</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalCausado)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Acreditado a 241215 en {year}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Pagado</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalPagado)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Aplicado al impuesto más antiguo</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Por pagar hoy (241215)</p>
          <p className={`text-lg font-bold tabular-nums ${saldo241215 > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatCOP(saldo241215)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {aperturaSaldo > 0 ? `Incluye ${formatCOP(aperturaSaldo)} del saldo inicial` : 'Saldo del pasivo en el libro'}
          </p>
        </div>
      </div>

      {/* Bimestre cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {bimData.map(bim => {
          const badge    = dueBadge(bim.daysLeft)
          const estado   = ESTADO_META[bim.estado]
          const pagado   = bim.estado === 'PAGADO'
          const err      = errors[bim.num]
          const f        = campo(bim.num)
          const vNac     = Math.round(parseFloat(f.nacional) || 0)
          const vIca     = Math.round(parseFloat(f.ica) || 0)
          const puedeCausar = vNac + vIca > 0 && f.soporte.trim() !== '' && loadingBim !== bim.num
          const sinActividad = bim.ingreso === 0 && bim.causado === 0

          return (
            <div
              key={bim.num}
              className={`bg-white border rounded-xl p-5 space-y-4 ${pagado ? 'border-green-200' : 'border-[#E2E8F0]'}`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">{bim.title}</p>
                  <p className="text-base font-semibold text-[#0F172A] mt-0.5">{bim.months}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!sinActividad && (
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${estado.cls}`}>{estado.label}</span>
                  )}
                  {!pagado && (bim.ingreso > 0 || bim.causado > 0) && (
                    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                  )}
                </div>
              </div>

              <p className="text-xs text-[#64748B]">
                {pagado && bim.ultimoPago
                  ? <>Pagado el <span className="font-medium text-green-700">{fmtDate(bim.ultimoPago)}</span></>
                  : <>Vencimiento: <span className="font-medium">{fmtDate(bim.dueDate)}</span></>}
              </p>

              {/* Breakdown */}
              <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-2">
                <Row label="Ingresos del bimestre (libro, neto de notas crédito)" value={bim.ingreso} />
                <Row label="Pensión empresa registrada (52057010)" value={bim.pension} sub />
                <Row label="Estimado referencial (fórmula simplificada)" value={bim.estimado} sub />

                <Divider />

                <Row label="Causado · componente nacional (54050505)" value={bim.nacional} />
                <Row label="Causado · ICA (54050510)" value={bim.ica} />
                <Row label="Total causado en 241215" value={bim.causado} bold />
                <Row label="Pagado" value={bim.pagado} />

                <div className="flex items-center justify-between gap-2 pt-1 border-t-2 border-[#E2E8F0]">
                  <span className="text-sm font-bold text-[#0F172A]">POR PAGAR</span>
                  <span className={`text-base font-bold tabular-nums ${bim.saldo > 0 ? 'text-[#2563EB]' : 'text-green-700'}`}>
                    {bim.saldo > 0 ? formatCOP(bim.saldo) : '$0'}
                  </span>
                </div>
              </div>

              {/* Causar: solo si el bimestre tiene ingresos y aún no está causado */}
              {bim.estado === 'SIN_CAUSAR' && bim.ingreso > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">Causar el impuesto del bimestre</p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Digita las cifras de la declaración (formulario 2593). Un asiento:{' '}
                      <span className="font-medium">DB 54050505 nacional + DB 54050510 ICA / CR 241215</span>, tercero DIAN, fechado el último día del bimestre.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-[#64748B]">
                      Componente nacional
                      <input type="number" min="0" step="1000" value={f.nacional}
                        onChange={e => setCampo(bim.num, { nacional: e.target.value })}
                        className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </label>
                    <label className="text-xs font-semibold text-[#64748B]">
                      ICA
                      <input type="number" min="0" step="1000" value={f.ica}
                        onChange={e => setCampo(bim.num, { ica: e.target.value })}
                        className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </label>
                  </div>
                  <label className="text-xs font-semibold text-[#64748B] block">
                    Soporte
                    <input type="text" value={f.soporte} placeholder="Formulario 2593 — borrador / definitivo"
                      onChange={e => setCampo(bim.num, { soporte: e.target.value })}
                      className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </label>
                  {vNac + vIca > 0 && (
                    <p className="text-xs text-[#64748B]">
                      Se causará <span className="font-bold tabular-nums text-[#0F172A]">{formatCOP(vNac + vIca)}</span> a 241215.
                    </p>
                  )}
                  {err && <p className="text-xs text-red-600 font-medium">✗ {err}</p>}
                  <button
                    onClick={() => handleCausar(bim.num)}
                    disabled={!puedeCausar}
                    className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                  >
                    {loadingBim === bim.num ? 'Causando…' : 'Causar impuesto del bimestre'}
                  </button>
                </div>
              )}

              {bim.estado !== 'SIN_CAUSAR' && err && <p className="text-xs text-red-600 font-medium">✗ {err}</p>}
              {bim.estado === 'PENDIENTE' || bim.estado === 'PARCIAL' ? (
                <p className="text-xs text-[#64748B]">
                  Para pagarlo usa <span className="font-medium">«Registrar pago del impuesto»</span> más abajo.
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* ── Sección A · Registrar reserva (custodia socio) ─────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">Reserva para impuestos (custodia socio)</h2>
            <p className="text-sm text-[#64748B] mt-0.5">
              Plata entregada a un socio para resguardar un impuesto futuro. Sale del banco hacia el socio:{' '}
              <span className="font-medium">DB 13251005 (socio) / CR 11100510</span>.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-[#64748B]">Reservado vigente</p>
            <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalReservado)}</p>
          </div>
        </div>

        {reservasPendientes.length === 0 ? (
          <p className="text-sm text-[#94A3B8] bg-[#F8FAFC] rounded-lg p-4">
            No hay movimientos pendientes. Categoriza la salida en <span className="font-medium">Bancos</span> con
            la categoría «Reserva para impuestos (custodia socio)» y asígnale el socio; aparecerá aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#94A3B8] border-b border-[#E2E8F0]">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Socio</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3">Descripción</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {reservasPendientes.map(r => (
                  <tr key={r.id} className="border-b border-[#F1F5F9]">
                    <td className="py-2 pr-3 text-[#64748B] whitespace-nowrap">{fmtDate(r.fecha)}</td>
                    <td className="py-2 pr-3 text-[#0F172A]">{r.socio}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#0F172A]">{formatCOP(r.monto)}</td>
                    <td className="py-2 pr-3 text-[#94A3B8] max-w-xs truncate">{r.descripcion}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleRegistrarReserva(r.id)}
                        disabled={loadingReserva === r.id}
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
                      >
                        {loadingReserva === r.id ? 'Registrando…' : 'Registrar reserva'}
                      </button>
                      {errReserva[r.id] && <p className="text-xs text-red-500 mt-1">{errReserva[r.id]}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sección B · Cerrar reserva contra el impuesto causado ───────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">Cerrar reserva contra el impuesto</h2>
            <p className="text-sm text-[#64748B] mt-0.5">
              Cuando el impuesto ya está causado (saldo en 241215), cancélalo con la plata reservada:{' '}
              <span className="font-medium">DB 241215 / CR 13251005 (socio)</span>.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-[#64748B]">Impuesto causado (241215)</p>
            <p className={`text-lg font-bold tabular-nums ${hayCausado ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`}>
              {formatCOP(saldo241215)}
            </p>
          </div>
        </div>

        {!hayCausado && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ⚠ 241215 no tiene impuesto causado. Primero causa el RST del bimestre (DB gasto / CR 241215);
            los botones de cierre se habilitan cuando exista saldo.
          </p>
        )}

        {reservasVigentes.length === 0 ? (
          <p className="text-sm text-[#94A3B8] bg-[#F8FAFC] rounded-lg p-4">
            No hay reservas vigentes por cerrar. Registra una reserva en la sección de arriba.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#94A3B8] border-b border-[#E2E8F0]">
                  <th className="py-2 pr-3">Socio</th>
                  <th className="py-2 pr-3 text-right">Reservado</th>
                  <th className="py-2 pr-3 text-right">Monto a cerrar</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {reservasVigentes.map(v => {
                  const tope = Math.min(v.reservado, saldo241215)
                  return (
                    <tr key={v.terceroId} className="border-b border-[#F1F5F9]">
                      <td className="py-2 pr-3 text-[#0F172A]">{v.socio}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#0F172A]">{formatCOP(v.reservado)}</td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="10000"
                          max={tope}
                          value={montoCierreVal(v)}
                          onChange={e => setMontoCierre(m => ({ ...m, [v.terceroId]: e.target.value }))}
                          disabled={!hayCausado}
                          className="w-36 text-right border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm bg-white text-[#0F172A] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleCerrarReserva(v)}
                          disabled={!hayCausado || loadingCierre === v.terceroId}
                          className="bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
                        >
                          {loadingCierre === v.terceroId ? 'Cerrando…' : 'Cerrar contra impuesto'}
                        </button>
                        {errCierre[v.terceroId] && <p className="text-xs text-red-500 mt-1">{errCierre[v.terceroId]}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sección C · Registrar pago del impuesto ──────────────────────────── */}
      <PagoImpuestoSection
        reservasVigentes={reservasVigentes}
        saldo241215={saldo241215}
        reservaLineas={reservaLineas}
        egresos={egresos}
        onDone={() => router.refresh()}
      />

      {/* Nota */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-sm text-yellow-800 leading-relaxed">
          <span className="font-bold">Cómo leer esta pantalla:</span>{' '}
          todo sale del libro contabilizado. Ingresos = cuentas 41xx menos notas crédito; pensión = 52057010;
          causado = lo acreditado a 241215; pagado = lo debitado a 241215, aplicado al impuesto más antiguo.
          El «estimado referencial» es una fórmula simplificada (3,1 % de ingresos − pensión) y{' '}
          <span className="font-semibold">no es la base de la causación</span>: las cifras reales son las de la declaración.
          Consulte su asesor contable —{' '}
          <span className="font-semibold">ISADAN Transportes SAS NIT 902030120-6</span>
        </p>
      </div>

    </div>
  )
}
