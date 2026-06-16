'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { marcarPagadoAction, type MarcarPagadoInput } from './actions'
import { formatCOP } from '@/lib/utils'
import type { TaxPayment } from './page'

// ── Constants ──────────────────────────────────────────────────────────────────

const RST_TIERS = [
  { max: 69_522_000,  rate: 0.031, pct: '3.1%', range: '$0 – $69.522.000' },
  { max: 139_044_000, rate: 0.034, pct: '3.4%', range: '$69.522.001 – $139.044.000' },
  { max: 208_566_000, rate: 0.038, pct: '3.8%', range: '$139.044.001 – $208.566.000' },
  { max: 278_088_000, rate: 0.043, pct: '4.3%', range: '$208.566.001 – $278.088.000' },
  { max: Infinity,    rate: 0.049, pct: '4.9%', range: 'Más de $278.088.000' },
]

const ICA_RATE = 0.00115

const BIM_META = [
  { num: 1, title: 'Bimestre 1', months: 'Enero / Febrero',           dueMonth: 5,  dueDay: 26 },
  { num: 2, title: 'Bimestre 2', months: 'Marzo / Abril',             dueMonth: 6,  dueDay: 24 },
  { num: 3, title: 'Bimestre 3', months: 'Mayo / Junio',              dueMonth: 7,  dueDay: 23 },
  { num: 4, title: 'Bimestre 4', months: 'Julio / Agosto',            dueMonth: 9,  dueDay: 22 },
  { num: 5, title: 'Bimestre 5', months: 'Septiembre / Octubre',      dueMonth: 11, dueDay: 25 },
  { num: 6, title: 'Bimestre 6', months: 'Noviembre / Diciembre',     dueMonth: 1,  dueDay: 26, nextYear: true },
] as const

// ── Helpers ────────────────────────────────────────────────────────────────────

function getRstRate(accumulated: number): number {
  for (const t of RST_TIERS) {
    if (accumulated <= t.max) return t.rate
  }
  return 0.049
}

function getTierIndex(accumulated: number): number {
  for (let i = 0; i < RST_TIERS.length; i++) {
    if (accumulated <= RST_TIERS[i].max) return i
  }
  return RST_TIERS.length - 1
}

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

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
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
  taxPayments,
}: {
  year: number
  availableYears: number[]
  incomeByBimestre: number[]
  taxPayments: TaxPayment[]
}) {
  const router = useRouter()

  const [pensions, setPensions] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const meta of BIM_META) {
      const saved = taxPayments.find(p => p.bimestre === meta.num)
      init[meta.num] = saved ? String(saved.pension_contribution) : '0'
    }
    return init
  })

  const [loadingBim, setLoadingBim] = useState<number | null>(null)
  const [errors,     setErrors]     = useState<Record<number, string>>({})

  // Per-bimestre computed data
  const bimData = useMemo(() => {
    let accumulated = 0
    return BIM_META.map((meta, idx) => {
      const income   = incomeByBimestre[idx] ?? 0
      accumulated   += income
      const rate     = getRstRate(accumulated)
      const rstGross = Math.round(income * rate)
      const ica      = Math.round(income * ICA_RATE)
      const pension  = Math.max(0, parseFloat(pensions[meta.num] ?? '0') || 0)
      const rstNet   = Math.max(0, rstGross - pension - ica)
      const total    = ica + rstNet
      const dueDate  = getDueDate(year, meta)
      const daysLeft = getDaysLeft(dueDate)
      const payment  = taxPayments.find(p => p.bimestre === meta.num) ?? null
      return { ...meta, income, accumulated, rate, rstGross, ica, pension, rstNet, total, dueDate, daysLeft, payment }
    })
  }, [incomeByBimestre, pensions, taxPayments, year])

  const totalIncome    = bimData.reduce((s, b) => s + b.income, 0)
  const totalRst       = bimData.reduce((s, b) => s + b.rstGross, 0)
  const totalIca       = bimData.reduce((s, b) => s + b.ica, 0)
  const currentTierIdx = getTierIndex(totalIncome)
  const currentRate    = RST_TIERS[currentTierIdx].rate

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
          <p className="text-xs font-semibold text-[#64748B] mb-1">Ingresos acumulados</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalIncome)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Año {year}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Tarifa RST aplicable</p>
          <p className="text-lg font-bold text-[#2563EB]">{fmtPct(currentRate)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Tramo {currentTierIdx + 1} de 5</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">RST estimado año</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalRst)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">ICA estimado año</p>
          <p className="text-lg font-bold text-[#0F172A] tabular-nums">{formatCOP(totalIca)}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">11.5‰ — ICA Bello</p>
        </div>
      </div>

      {/* RST rate table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <h2 className="text-sm font-semibold text-[#0F172A]">Tabla de tarifas RST — Sector Transporte 2026</h2>
          <p className="text-xs text-[#64748B] mt-0.5">Tarifa determinada por ingresos acumulados del año</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-2 text-xs font-semibold text-[#64748B]">Ingresos acumulados anuales</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B]">Tarifa RST</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {RST_TIERS.map((tier, i) => {
              const isActive = i === currentTierIdx
              return (
                <tr key={i} className={isActive ? 'bg-blue-50' : 'hover:bg-[#F8FAFC]'}>
                  <td className={`px-4 py-3 text-sm ${isActive ? 'font-semibold text-[#2563EB]' : 'text-[#64748B]'}`}>
                    {tier.range}
                    {isActive && (
                      <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                        TRAMO ACTUAL
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${isActive ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                    {tier.pct}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
                <Row label={`↳ Acumulados hasta este bimestre`} value={bim.accumulated} sub />

                <Divider />

                <Row label={`RST bruto (${fmtPct(bim.rate)} sobre ingresos)`} value={bim.rstGross} />

                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#64748B] flex-1">(-) Aporte pensión empresa</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={pensions[bim.num] ?? '0'}
                    onChange={e => setPensions(p => ({ ...p, [bim.num]: e.target.value }))}
                    disabled={isPaid}
                    className={`w-36 text-right border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                      isPaid
                        ? 'bg-[#F8FAFC] text-[#94A3B8] cursor-not-allowed'
                        : 'bg-white text-[#0F172A]'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#64748B]">(-) ICA Bello (11.5‰)</span>
                  <span className="text-sm text-[#0F172A] tabular-nums">
                    {bim.ica === 0 ? '—' : formatCOP(bim.ica)}
                  </span>
                </div>

                <Divider />

                <Row label="RST neto" value={bim.rstNet} bold />

                <div className="flex items-center justify-between gap-2 pt-1 border-t-2 border-[#E2E8F0]">
                  <span className="text-sm font-bold text-[#0F172A]">TOTAL A PAGAR</span>
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

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-sm text-yellow-800 leading-relaxed">
          <span className="font-bold">IMPORTANTE:</span>{' '}
          Valores estimados. Las tarifas RST se aplican según ingresos acumulados del año.
          El aporte a pensión debe confirmarse con nómina electrónica.
          Consulte su asesor contable —{' '}
          <span className="font-semibold">ISADAN Transportes SAS NIT 902030120-6</span>
        </p>
      </div>

    </div>
  )
}
