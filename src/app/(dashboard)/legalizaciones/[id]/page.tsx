import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { fetchLegalizacionDetailAction } from '../export-comprobante'
import { ExportComprobanteButton } from '../ExportComprobanteButton'
import { legalizacionBalance } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: number) => COP.format(v)

function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(iso + 'T00:00:00'))
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  BORRADOR:  { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600' },
  PENDIENTE: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  APROBADA:  { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
}

const EXPENSE_LABELS: Record<string, string> = {
  acpm_contado:     'ACPM / Combustible',
  peajes:           'Peajes',
  cargue:           'Cargue',
  descargue:        'Descargue',
  comision_empresa: 'Comisión empresa',
  llantas:          'Llantas',
  engrase:          'Engrase / Aceite',
  cambio_aceite:    'Cambio de aceite',
  lavada:           'Lavada',
  parqueos:         'Parqueos',
  carrozada:        'Carrozada',
  descarrozada:     'Descarrozada',
  varada:           'Varada',
  varadas:          'Varadas',
  otros:            'Otros',
  porcentaje:       '% Flete conductor',
}

function expLabel(expType: string): string {
  return EXPENSE_LABELS[expType] ?? expType
}

export default async function LegalizacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const result = await fetchLegalizacionDetailAction(id)

  if (!result.ok || !result.data) {
    notFound()
  }

  const d      = result.data
  const badge  = STATUS_BADGE[d.status] ?? { label: d.status, cls: 'bg-gray-100 text-gray-600' }
  const totalDebits = d.expenses.reduce((s, e) => s + e.amount, 0)
  // balance = anticipo − gastos (misma convención que la lista principal)
  const balance   = d.advanceAmount - totalDebits
  const balInfo   = legalizacionBalance(balance)

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Back + actions */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/legalizaciones"
          className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ArrowLeft size={14} />
          Legalizaciones
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={`/legalizaciones/${id}/editar`}
            className="flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
          >
            <Pencil size={13} />
            Editar
          </Link>
          <ExportComprobanteButton legId={id} />
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-[#0F172A]">
                Viaje {d.tripNumber}
              </h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-[#64748B]">
              {d.origin} → {d.destination}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-[#64748B] mt-1">
              <span className="font-mono font-semibold text-[#0F172A]">{d.plate}</span>
              <span>{d.driverName}</span>
              {d.date && <span>{fmtDateLong(d.date)}</span>}
            </div>
          </div>

          {/* KPIs */}
          <div className="flex flex-wrap gap-4">
            {[
              { label: 'Anticipo',      value: d.advanceAmount,  cls: 'text-[#0F172A]' },
              { label: 'Total gastos',  value: d.totalExpenses,  cls: 'text-[#0F172A]' },
              {
                label:  balInfo.label,
                value:  Math.abs(balance),
                cls:    `${balInfo.colorClass} font-semibold`,
              },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-right">
                <p className={`text-base tabular-nums ${cls}`}>{fmt(value)}</p>
                <p className="text-xs text-[#94A3B8]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expenses table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">
            Gastos legalizados
          </p>
        </div>

        {d.expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#94A3B8]">Sin gastos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Concepto</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide hidden md:table-cell">Cuenta PUC</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide hidden md:table-cell">Nombre cuenta</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Descripción</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {d.expenses.map((exp, i) => (
                  <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-4 text-sm font-medium text-[#0F172A]">
                      {expLabel(exp.expenseType)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-[#64748B] hidden md:table-cell">
                      {exp.pucCode}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#64748B] hidden md:table-cell">
                      {exp.pucName}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#94A3B8]">
                      {exp.description ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-sm text-[#0F172A]">
                      {fmt(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC]">
                  <td colSpan={4} className="py-2.5 px-4 text-xs font-semibold text-[#374151] uppercase tracking-wide">
                    Total gastos
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-bold text-[#0F172A]">
                    {fmt(totalDebits)}
                  </td>
                </tr>
                <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  <td colSpan={4} className="py-2.5 px-4 text-xs text-[#64748B]">
                    Anticipo entregado (13301510)
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-xs text-emerald-700 font-semibold">
                    {fmt(d.advanceAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
