'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, AlertCircle, Clock, Minus,
  TrendingUp, DollarSign, Wallet,
} from 'lucide-react'
import { importarCarteraAction } from './actions'
import type { CarteraKPIs, ClienteSummary, EstadoCartera } from './page'
import { useUrlState } from '@/lib/useUrlState'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

const ESTADO_BADGE: Record<EstadoCartera, { label: string; cls: string }> = {
  AL_DIA:    { label: 'Al día',    cls: 'bg-green-100 text-green-800' },
  PENDIENTE: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-red-100 text-red-800' },
}

export default function CarteraClient({
  kpis,
  clients,
}: {
  kpis: CarteraKPIs
  clients: ClienteSummary[]
}) {
  const router        = useRouter()
  const [crossing, setCrossing] = useState(false)
  const [crossMsg, setCrossMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [filter, setFilter]     = useUrlState('estado', 'TODOS') as ['TODOS' | EstadoCartera, (v: string) => void]

  const handleImportar = async () => {
    setCrossing(true)
    setCrossMsg(null)
    const res = await importarCarteraAction()
    setCrossing(false)
    if (!res.ok) {
      setCrossMsg({ type: 'err', text: res.error ?? 'Error al importar' })
    } else if (res.created === 0) {
      setCrossMsg({ type: 'ok', text: res.message ?? 'Sin cambios.' })
    } else {
      setCrossMsg({ type: 'ok', text: res.message ?? `${res.created} factura(s) importada(s).` })
      setTimeout(() => router.refresh(), 800)
    }
  }

  const filtered = filter === 'TODOS'
    ? clients
    : clients.filter(c => c.estado === filter)

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Cartera</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Estado de cuentas por cobrar · {clients.length} cliente{clients.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {crossMsg && (
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
              crossMsg.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {crossMsg.text}
            </span>
          )}
          <button
            onClick={handleImportar}
            disabled={crossing}
            title="Crea la cartera (AR entry) de las facturas emitidas que aún no la tienen. No cruza anticipos: el cruce es el evento 4 contable."
            className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
          >
            <RefreshCw size={14} className={crossing ? 'animate-spin' : ''} />
            {crossing ? 'Importando…' : 'Importar facturas'}
          </button>
        </div>
      </div>

      {/* Table not yet created banner */}
      {!kpis.tableExists && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">Tabla no creada</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Ejecuta el SQL del archivo <code className="font-mono bg-yellow-100 px-1 rounded">cartera/actions.ts</code> en Supabase antes de usar este módulo.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total facturado',
            value: kpis.totalFacturado,
            icon: TrendingUp,
            iconCls: 'text-[#2563EB] bg-blue-50',
            valueCls: 'text-[#0F172A]',
          },
          {
            label: 'Anticipos recibidos',
            value: kpis.totalAnticipos,
            icon: Wallet,
            iconCls: 'text-emerald-600 bg-emerald-50',
            valueCls: 'text-[#0F172A]',
          },
          {
            label: 'Cartera pendiente',
            value: kpis.totalCartera,
            icon: Clock,
            iconCls: 'text-yellow-600 bg-yellow-50',
            valueCls: kpis.totalCartera > 0 ? 'text-yellow-700' : 'text-green-700',
          },
          {
            label: 'Anticipos sin aplicar',
            value: kpis.sinAplicar,
            icon: DollarSign,
            iconCls: kpis.sinAplicar > 0 ? 'text-purple-600 bg-purple-50' : 'text-green-600 bg-green-50',
            valueCls: kpis.sinAplicar > 0 ? 'text-purple-700' : 'text-green-700',
          },
        ].map(({ label, value, icon: Icon, iconCls, valueCls }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls}`}>
                <Icon size={15} />
              </div>
              <div className="min-w-0">
                <p className={`text-base md:text-lg font-bold tabular-nums leading-tight ${valueCls}`}>
                  {fmt(value)}
                </p>
                <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {clients.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {(['TODOS', 'AL_DIA', 'PENDIENTE', 'VENCIDO'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-[#F1F5F9] text-[#374151] hover:bg-[#E2E8F0]'
              }`}
            >
              {f === 'TODOS' ? 'Todos' : ESTADO_BADGE[f].label}
            </button>
          ))}
        </div>
      )}

      {/* Client table */}
      {filtered.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cliente</th>
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">NIT</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Total facturado</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Total pagado</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Saldo pendiente</th>
                  <th className="text-center py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Facturas</th>
                  <th className="text-center py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Estado</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filtered.map(c => {
                  const badge  = ESTADO_BADGE[c.estado]
                  const nitKey = encodeURIComponent(c.clientNit ?? c.clientName)
                  return (
                    <tr key={nitKey} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-4 font-medium text-[#0F172A]">{c.clientName}</td>
                      <td className="py-3 px-4 text-[#64748B] font-mono text-xs">{c.clientNit ?? '—'}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#0F172A]">{fmt(c.totalFacturado)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#64748B]">{fmt(c.totalPagado)}</td>
                      <td className={`py-3 px-4 text-right tabular-nums font-semibold ${
                        c.pendiente <= 0 ? 'text-green-600' : 'text-yellow-700'
                      }`}>
                        {fmt(Math.max(0, c.pendiente))}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-xs text-[#64748B]">
                          {c.pagadaCount > 0 && (
                            <span className="text-green-600 font-medium">{c.pagadaCount}✓ </span>
                          )}
                          {c.abonadaCount > 0 && (
                            <span className="text-blue-600 font-medium">{c.abonadaCount}≈ </span>
                          )}
                          {c.pendienteCount > 0 && (
                            <span className="text-yellow-600 font-medium">{c.pendienteCount}⏳</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/cartera/${nitKey}`}
                          className="text-xs font-medium text-[#2563EB] hover:underline"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : kpis.tableExists ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Minus size={20} className="text-[#94A3B8]" />
          </div>
          <p className="text-sm font-medium text-[#0F172A]">
            {filter !== 'TODOS' ? `No hay clientes con estado ${ESTADO_BADGE[filter]?.label ?? filter}` : 'No hay entradas de cartera'}
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            Haz clic en <strong>Cruzar anticipos</strong> para importar facturas emitidas.
          </p>
        </div>
      ) : null}
    </div>
  )
}
