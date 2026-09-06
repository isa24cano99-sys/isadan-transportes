'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import {
  marcarPagadoAction, registrarReservaAction, cerrarReservaAction,
  type MarcarPagadoInput,
} from './actions'
import { formatCOP } from '@/lib/utils'
import type { TaxPayment, ReservaPendiente, ReservaVigente } from './page'

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function ImpuestoClient({
  year,
  availableYears,
  incomeByBimestre,
  pensionByBimestre,
  hasSsData,
  taxPayments,
  reservasPendientes,
  reservasVigentes,
  saldo241215,
}: {
  year: number
  availableYears: number[]
  incomeByBimestre: number[]
  pensionByBimestre: number[]
  hasSsData: boolean[]
  taxPayments: TaxPayment[]
  reservasPendientes: ReservaPendiente[]
  reservasVigentes: ReservaVigente[]
  saldo241215: number
}) {
  const router = useRouter()

  // Manual pension input — only used when no SS planilla exists for a bimestre
  const [manualPensions, setManualPensions] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const meta of BIM_META) {
      const saved = taxPayments.find(p => p.bimestre === meta.num)
      init[meta.num] = saved ? String(saved.pension_contribution) : '0'
    }
    return init
  })

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

  // Per-bimestre computed data
  const bimData = useMemo(() => {
    return BIM_META.map((meta, idx) => {
      const income   = incomeByBimestre[idx]   ?? 0
      const ssExists = hasSsData[idx]           ?? false
      const pension  = ssExists
        ? Math.max(0, pensionByBimestre[idx] ?? 0)
        : Math.max(0, parseFloat(manualPensions[meta.num] ?? '0') || 0)
      const rstGross = Math.round(income * RST_RATE)
      const ica      = Math.round(income * ICA_RATE)
      const rstNet   = Math.max(0, rstGross - pension - ica)
      const total    = ica + rstNet
      const dueDate  = getDueDate(year, meta)
      const daysLeft = getDaysLeft(dueDate)
      const payment  = taxPayments.find(p => p.bimestre === meta.num) ?? null
      return { ...meta, income, ssExists, pension, rstGross, ica, rstNet, total, dueDate, daysLeft, payment }
    })
  }, [incomeByBimestre, pensionByBimestre, hasSsData, manualPensions, taxPayments, year])

  const totalIncome = bimData.reduce((s, b) => s + b.income, 0)
  const totalRst    = bimData.reduce((s, b) => s + b.rstGross, 0)
  const totalIca    = bimData.reduce((s, b) => s + b.ica, 0)
  const totalPagar  = bimData.reduce((s, b) => s + b.total, 0)

  const handleMarcarPagado = async (bim: (typeof bimData)[number]) => {
    setLoadingBim(bim.num)
    setErrors(e => ({ ...e, [bim.num]: '' }))

    const input: MarcarPagadoInput = {
      year,
      bimestre:             bim.num,
      income:               bim.income,
      rst_gross:            bim.rstGross,
      pension_contribution: bim.pension,
      ica:                  bim.ica,
      rst_net:              bim.rstNet,
      total_to_pay:         bim.total,
    }

    const result = await marcarPagadoAction(input)
    if (result.ok) {
      router.refresh()
    } else {
      setErrors(e => ({ ...e, [bim.num]: result.error ?? 'Error al guardar' }))
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Ingresos facturados</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalIncome)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Facturas EMITIDAS {year}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Tarifa RST</p>
          <p className="text-lg font-bold text-[#2563EB]">3.1%</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Sector Transporte</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">RST bruto año</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalRst)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Antes de descuentos</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">ICA año</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalIca)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">11.5‰ — ICA Bello</p>
        </div>
      </div>

      {/* Bimestre cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {bimData.map(bim => {
          const badge  = dueBadge(bim.daysLeft)
          const isPaid = bim.payment?.paid === true
          const err    = errors[bim.num]

          return (
            <div
              key={bim.num}
              className={`bg-white border rounded-xl p-5 space-y-4 ${
                isPaid ? 'border-green-200' : 'border-[#E2E8F0]'
              }`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">{bim.title}</p>
                  <p className="text-base font-semibold text-[#0F172A] mt-0.5">{bim.months}</p>
                </div>
                {isPaid ? (
                  <span className="shrink-0 inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200">
                    ✓ Pagado
                  </span>
                ) : (
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </div>

              {/* Date info */}
              {isPaid && bim.payment?.paid_date ? (
                <p className="text-xs text-green-600 font-medium">
                  Pagado el {fmtDate(bim.payment.paid_date)}
                </p>
              ) : (
                <p className="text-xs text-[#94A3B8]">
                  Vencimiento:{' '}
                  <span className="font-medium text-[#64748B]">{fmtDate(bim.dueDate)}</span>
                </p>
              )}

              {/* Breakdown */}
              <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-2">
                <Row label="Ingresos gravados bimestre" value={bim.income} />

                <Divider />

                <Row label="RST bruto (3.1% × ingresos)" value={bim.rstGross} />

                {/* Pension row — locked if SS planilla exists, editable if not */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#64748B] flex-1">
                    (-) Aporte pensión empresa
                    {bim.ssExists && (
                      <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                        Planilla SS
                      </span>
                    )}
                  </span>
                  {bim.ssExists || isPaid ? (
                    <span className="text-sm text-[#0F172A] tabular-nums w-36 text-right">
                      {bim.pension === 0 ? '—' : formatCOP(bim.pension)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={manualPensions[bim.num] ?? '0'}
                      onChange={e => setManualPensions(p => ({ ...p, [bim.num]: e.target.value }))}
                      placeholder="Ingrese manualmente"
                      className="w-36 text-right border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  )}
                </div>

                {!bim.ssExists && !isPaid && (
                  <p className="text-xs text-amber-600 pl-3">
                    Sin planilla SS registrada — ingrese el valor de pensión manualmente
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#64748B]">(-) ICA Bello (11.5‰ × ingresos)</span>
                  <span className="text-sm text-[#0F172A] tabular-nums">
                    {bim.ica === 0 ? '—' : formatCOP(bim.ica)}
                  </span>
                </div>

                <Divider />

                <Row label="RST neto (MAX(0, RST bruto − pensión − ICA))" value={bim.rstNet} bold />

                <div className="flex items-center justify-between gap-2 pt-1 border-t-2 border-[#E2E8F0]">
                  <span className="text-sm font-bold text-[#0F172A]">TOTAL A PAGAR (ICA + RST neto)</span>
                  <span className="text-base font-bold text-[#2563EB] tabular-nums">
                    {bim.total === 0 ? '$0' : formatCOP(bim.total)}
                  </span>
                </div>
              </div>

              {/* Error */}
              {err && <p className="text-xs text-red-500 font-medium">{err}</p>}

              {/* Action button */}
              {isPaid ? (
                <div className="flex items-center justify-center gap-2 py-2.5 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-green-700 text-sm font-semibold">✓ Pago registrado correctamente</span>
                </div>
              ) : (
                <button
                  onClick={() => handleMarcarPagado(bim)}
                  disabled={loadingBim === bim.num}
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                >
                  {loadingBim === bim.num ? 'Guardando...' : 'Marcar como pagado'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Annual total */}
      {totalPagar > 0 && (
        <div className="bg-[#0F172A] rounded-xl p-4 flex items-center justify-between">
          <p className="text-white font-semibold text-sm">Total estimado a pagar año {year}</p>
          <p className="text-white font-bold text-lg tabular-nums">{formatCOP(totalPagar)}</p>
        </div>
      )}

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

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-sm text-yellow-800 leading-relaxed">
          <span className="font-bold">IMPORTANTE:</span>{' '}
          Ingresos tomados de facturas electrónicas EMITIDAS. Pensión tomada de planilla de seguridad social registrada.
          Fórmula: RST bruto = ingresos × 3.1% — ICA = ingresos × 1.15% — RST neto = MAX(0, RST bruto − pensión − ICA).
          Consulte su asesor contable —{' '}
          <span className="font-semibold">ISADAN Transportes SAS NIT 902030120-6</span>
        </p>
      </div>

    </div>
  )
}
