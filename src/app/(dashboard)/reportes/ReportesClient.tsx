'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCOP } from '@/lib/utils'
import type { MonthData, EntityData, TipoFilter } from './page'

// ── Constants ─────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#2563EB','#22C55E','#F97316','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#6366F1']

const MESES_OPTS = [
  { value: 0,  label: 'Todos los meses' },
  { value: 1,  label: 'Enero' },  { value: 2,  label: 'Febrero' },
  { value: 3,  label: 'Marzo' },  { value: 4,  label: 'Abril' },
  { value: 5,  label: 'Mayo' },   { value: 6,  label: 'Junio' },
  { value: 7,  label: 'Julio' },  { value: 8,  label: 'Agosto' },
  { value: 9,  label: 'Septiembre' }, { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },  { value: 12, label: 'Diciembre' },
]

const TABS = [
  { id: 'pyl',       label: 'Estado de resultados' },
  { id: 'vehiculo',  label: 'Por vehículo' },
  { id: 'conductor', label: 'Por conductor' },
  { id: 'cliente',   label: 'Por cliente' },
] as const

type TabId = typeof TABS[number]['id']

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return `${v}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold text-[#0F172A] mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[#64748B]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className={`font-medium tabular-nums ${Number(entry.value) < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>
            {formatCOP(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-lg text-sm">
      <p className="font-semibold text-[#0F172A]">{name}</p>
      <p className="text-[#64748B]">{formatCOP(value)}</p>
      <p className="text-xs text-[#94A3B8]">{p.pct}% del total</p>
    </div>
  )
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color = 'blue',
}: {
  label: string; value: number; sub?: string; color?: 'green' | 'red' | 'blue' | 'purple'
}) {
  const colors = {
    green:  'bg-green-50 border-green-200 text-green-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold opacity-70 mb-1">{label}</p>
      <p className="text-lg font-bold">{formatCOP(value)}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── P&L table ─────────────────────────────────────────────────────────────────

function PylTable({ months, activeOnly = false }: { months: MonthData[]; activeOnly?: boolean }) {
  const displayMonths = activeOnly
    ? months.filter(m => m.ingresos > 0 || m.costos > 0 || m.gastos_financieros > 0)
    : months

  const totals = displayMonths.reduce(
    (acc, m) => ({
      ingresos:          acc.ingresos + m.ingresos,
      costos:            acc.costos + m.costos,
      gastos_financieros: acc.gastos_financieros + m.gastos_financieros,
      utilidad_bruta:    acc.utilidad_bruta + m.utilidad_bruta,
      utilidad_neta:     acc.utilidad_neta + m.utilidad_neta,
    }),
    { ingresos: 0, costos: 0, gastos_financieros: 0, utilidad_bruta: 0, utilidad_neta: 0 },
  )

  const colH = 'px-3 py-3 text-xs font-semibold text-[#64748B] text-right first:text-left'
  const cell = (v: number, bold = false) => (
    <td className={`px-3 py-3 text-sm text-right tabular-nums ${bold ? 'font-bold' : ''} ${
      v < 0 ? 'text-red-600' : v > 0 ? 'text-[#0F172A]' : 'text-[#94A3B8]'
    }`}>
      {v === 0 ? '—' : formatCOP(v)}
    </td>
  )

  const hasData = displayMonths.some(m => m.ingresos > 0 || m.costos > 0)

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <th className={colH}>Mes</th>
            <th className={colH}>Ingresos</th>
            <th className={colH}>Costos operativos</th>
            <th className={colH}>Utilidad bruta</th>
            <th className={colH}>Gastos financieros</th>
            <th className={colH}>Utilidad neta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0]">
          {!hasData ? (
            <tr>
              <td colSpan={6} className="text-center py-10 text-sm text-[#64748B]">
                No hay datos para este período
              </td>
            </tr>
          ) : (
            displayMonths.map(m => (
              <tr key={m.month} className={`hover:bg-[#F8FAFC] transition-colors ${
                m.ingresos === 0 && m.costos === 0 ? 'opacity-40' : ''
              }`}>
                <td className="px-3 py-3 text-sm font-medium text-[#0F172A]">{m.label}</td>
                {cell(m.ingresos)}
                {cell(m.costos)}
                {cell(m.utilidad_bruta, true)}
                {cell(m.gastos_financieros)}
                {cell(m.utilidad_neta, true)}
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <td className="px-3 py-3 text-sm font-bold text-[#0F172A]">TOTAL</td>
            {[totals.ingresos, totals.costos, totals.utilidad_bruta,
              totals.gastos_financieros, totals.utilidad_neta].map((v, i) => (
              <td key={i} className={`px-3 py-3 text-sm font-bold text-right tabular-nums ${
                v < 0 ? 'text-red-600' : 'text-[#0F172A]'
              }`}>
                {v === 0 ? '—' : formatCOP(v)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Entity table ──────────────────────────────────────────────────────────────

function EntityTable({ data, labelHeader }: { data: EntityData[]; labelHeader: string }) {
  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl py-12 text-center text-sm text-[#64748B]">
        No hay datos para este período
      </div>
    )
  }

  const totals = data.reduce(
    (acc, d) => ({ ingresos: acc.ingresos + d.ingresos, costos: acc.costos + d.costos,
                   viajes: acc.viajes + d.viajes, utilidad: acc.utilidad + d.utilidad }),
    { ingresos: 0, costos: 0, viajes: 0, utilidad: 0 },
  )
  const totalMargen = totals.ingresos > 0
    ? Math.round((totals.utilidad / totals.ingresos) * 100) : 0

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">{labelHeader}</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Viajes</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Ingresos</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Costos</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Utilidad</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Margen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0]">
          {data.map(d => (
            <tr key={d.id} className="hover:bg-[#F8FAFC] transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{d.label}</td>
              <td className="px-4 py-3 text-sm text-right text-[#64748B]">{d.viajes}</td>
              <td className="px-4 py-3 text-sm text-right font-medium text-[#0F172A] tabular-nums">
                {d.ingresos > 0 ? formatCOP(d.ingresos) : '—'}
              </td>
              <td className="px-4 py-3 text-sm text-right text-[#64748B] tabular-nums">
                {d.costos > 0 ? formatCOP(d.costos) : '—'}
              </td>
              <td className={`px-4 py-3 text-sm text-right font-bold tabular-nums ${
                d.utilidad < 0 ? 'text-red-600' : d.utilidad > 0 ? 'text-green-700' : 'text-[#94A3B8]'
              }`}>
                {d.utilidad === 0 ? '—' : formatCOP(d.utilidad)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  d.margen > 20  ? 'bg-green-100 text-green-700'  :
                  d.margen > 0   ? 'bg-blue-100 text-blue-700'    :
                  d.margen < 0   ? 'bg-red-100 text-red-700'      :
                                   'bg-[#F1F5F9] text-[#64748B]'
                }`}>
                  {d.margen}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <td className="px-4 py-3 text-sm font-bold text-[#0F172A]">TOTAL</td>
            <td className="px-4 py-3 text-sm text-right font-bold text-[#0F172A]">{totals.viajes}</td>
            <td className="px-4 py-3 text-sm text-right font-bold text-[#0F172A] tabular-nums">{formatCOP(totals.ingresos)}</td>
            <td className="px-4 py-3 text-sm text-right font-bold text-[#0F172A] tabular-nums">{formatCOP(totals.costos)}</td>
            <td className={`px-4 py-3 text-sm text-right font-bold tabular-nums ${
              totals.utilidad < 0 ? 'text-red-600' : 'text-green-700'
            }`}>{formatCOP(totals.utilidad)}</td>
            <td className="px-4 py-3 text-right">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                totalMargen > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>{totalMargen}%</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function ReportesClient({
  year,
  filterMonth,
  tipo,
  availableYears,
  months,
  byVehicle,
  byDriver,
  byClient,
}: {
  year: number
  filterMonth: number | null
  tipo: TipoFilter
  availableYears: number[]
  months: MonthData[]
  byVehicle: EntityData[]
  byDriver: EntityData[]
  byClient: EntityData[]
}) {
  const router  = useRouter()
  const [tab, setTab] = useState<TabId>('pyl')
  const activeTab: TabId = tipo === 'CASA' ? 'pyl' : tab

  const navigate = (newYear: number, newMonth: number | null, newTipo: TipoFilter) => {
    const p = new URLSearchParams({ año: String(newYear), tipo: newTipo })
    if (newMonth) p.set('mes', String(newMonth))
    router.push(`/reportes?${p.toString()}`)
  }

  const tipoBtn = (v: TipoFilter, label: string) => (
    <button
      onClick={() => navigate(year, filterMonth, v)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        tipo === v
          ? 'bg-[#2563EB] text-white'
          : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
      }`}
    >
      {label}
    </button>
  )

  const totals = months.reduce(
    (acc, m) => ({
      ingresos:          acc.ingresos + m.ingresos,
      costos:            acc.costos + m.costos,
      gastos_financieros: acc.gastos_financieros + m.gastos_financieros,
      utilidad_neta:     acc.utilidad_neta + m.utilidad_neta,
    }),
    { ingresos: 0, costos: 0, gastos_financieros: 0, utilidad_neta: 0 },
  )

  // Chart data — monthly view (only when no month filter)
  const barData = months.map(m => ({
    name: m.label.slice(0, 3),
    Ingresos: m.ingresos,
    'Costos op.': m.costos,
    'G. financieros': m.gastos_financieros,
  }))

  const lineData = months.map(m => ({
    name: m.label.slice(0, 3),
    'Utilidad bruta': m.utilidad_bruta,
    'Utilidad neta':  m.utilidad_neta,
  }))

  // Entity bar chart — used in single-month view
  const entityBarData = byVehicle
    .filter(v => v.ingresos > 0 || v.costos > 0)
    .slice(0, 8)
    .map(v => ({ name: v.label, Ingresos: v.ingresos, Costos: v.costos }))

  const totalIngresosVehiculos = byVehicle.reduce((s, v) => s + v.ingresos, 0)
  const pieData = byVehicle
    .filter(v => v.ingresos > 0)
    .slice(0, 8)
    .map(v => ({
      name:  v.label,
      value: v.ingresos,
      pct:   totalIngresosVehiculos > 0
        ? Math.round((v.ingresos / totalIngresosVehiculos) * 100) : 0,
    }))

  const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
    if (!pieData[index] || pieData[index].pct < 5) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {pieData[index].pct}%
      </text>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Estado de resultados</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            {filterMonth
              ? `${MESES_OPTS[filterMonth].label} ${year}`
              : `Año ${year} · todos los meses`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <select
            value={year}
            onChange={e => navigate(Number(e.target.value), filterMonth, tipo)}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm font-medium text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={filterMonth ?? 0}
            onChange={e => navigate(year, Number(e.target.value) || null, tipo)}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm font-medium text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            {MESES_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tipo selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#64748B] mr-1">Vista:</span>
        {tipoBtn('TODO',    'Todo')}
        {tipoBtn('NEGOCIO', 'Solo operación')}
        {tipoBtn('CASA',    'Solo casa')}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Ingresos totales"      value={totals.ingresos}          color="green"  />
        <SummaryCard label="Costos operativos"     value={totals.costos}            color="red"    />
        <SummaryCard label="Gastos financieros"    value={totals.gastos_financieros} color="purple" />
        <SummaryCard
          label="Utilidad neta"
          value={totals.utilidad_neta}
          color={totals.utilidad_neta >= 0 ? 'blue' : 'red'}
          sub={totals.ingresos > 0
            ? `Margen: ${Math.round((totals.utilidad_neta / totals.ingresos) * 100)}%`
            : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1">
        {(tipo === 'CASA' ? TABS.filter(t => t.id === 'pyl') : TABS).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id
                ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Estado de resultados ── */}
      {activeTab === 'pyl' && (
        <div className="space-y-6">
          {filterMonth ? (
            /* ── Single-month view: entity bar chart ── */
            entityBarData.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#0F172A] mb-4">
                  Ingresos vs Costos por vehículo — {MESES_OPTS[filterMonth].label} {year}
                </h2>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={entityBarData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="rect" iconSize={10} />
                      <Bar dataKey="Ingresos" fill="#22C55E" radius={[3,3,0,0]} maxBarSize={32} />
                      <Bar dataKey="Costos"   fill="#F97316" radius={[3,3,0,0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          ) : (
            /* ── Full-year view: monthly charts ── */
            <>
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Ingresos vs Costos por mes</h2>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="rect" iconSize={10} />
                      <Bar dataKey="Ingresos"       fill="#22C55E" radius={[3,3,0,0]} maxBarSize={28} />
                      <Bar dataKey="Costos op."     fill="#F97316" radius={[3,3,0,0]} maxBarSize={28} />
                      <Bar dataKey="G. financieros" fill="#8B5CF6" radius={[3,3,0,0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Utilidad mensual</h2>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                      <Line dataKey="Utilidad bruta" stroke="#2563EB" strokeWidth={2} dot={false} />
                      <Line dataKey="Utilidad neta"  stroke="#10B981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* P&L table — shows all months in year view, only active month when filtered */}
          <PylTable months={months} activeOnly={!!filterMonth} />
        </div>
      )}

      {/* ── Tab: Por vehículo ── */}
      {activeTab === 'vehiculo' && (
        <div className="space-y-6">
          {/* Pie chart */}
          {pieData.length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Participación de ingresos por vehículo</h2>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="h-[240px] w-full lg:w-[320px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        labelLine={false}
                        label={renderCustomPieLabel}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-[#64748B]">{d.name}</span>
                      <span className="font-semibold text-[#0F172A] tabular-nums">{formatCOP(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <EntityTable data={byVehicle} labelHeader="Vehículo" />
        </div>
      )}

      {/* ── Tab: Por conductor ── */}
      {activeTab === 'conductor' && (
        <EntityTable data={byDriver} labelHeader="Conductor" />
      )}

      {/* ── Tab: Por cliente ── */}
      {activeTab === 'cliente' && (
        <EntityTable data={byClient} labelHeader="Cliente" />
      )}
    </div>
  )
}
