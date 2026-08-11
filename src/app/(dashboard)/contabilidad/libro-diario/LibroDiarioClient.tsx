'use client'

import { useMemo, useState } from 'react'
import { formatCOP } from '@/lib/utils'

export type Linea = {
  cuenta: string
  cuentaNombre: string
  tercero: string | null
  centroCosto: string | null
  debito: number
  credito: number
}

export type Asiento = {
  id: string
  tipo: string
  consecutivo: number
  comprobante: string
  fecha: string
  descripcion: string
  lineas: Linea[]
  totalDebito: number
  totalCredito: number
}

const TIPO_COLOR: Record<string, string> = {
  CA: 'bg-purple-50 text-purple-700 border-purple-200',
  CI: 'bg-blue-50 text-blue-700 border-blue-200',
  CF: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  RC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CX: 'bg-amber-50 text-amber-700 border-amber-200',
  CG: 'bg-rose-50 text-rose-700 border-rose-200',
  CB: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  CN: 'bg-teal-50 text-teal-700 border-teal-200',
  RV: 'bg-red-100 text-red-800 border-red-300',
}

export default function LibroDiarioClient({
  asientos, tipoNombre,
}: { asientos: Asiento[]; tipoNombre: Record<string, string> }) {
  const [filtro, setFiltro] = useState<string>('TODOS')

  const tipos = useMemo(() => {
    const c: Record<string, number> = {}
    asientos.forEach(a => { c[a.tipo] = (c[a.tipo] ?? 0) + 1 })
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]))
  }, [asientos])

  const visibles = filtro === 'TODOS' ? asientos : asientos.filter(a => a.tipo === filtro)

  const totalDebito = asientos.reduce((s, a) => s + a.totalDebito, 0)
  const totalCredito = asientos.reduce((s, a) => s + a.totalCredito, 0)
  const cuadraGlobal = Math.abs(totalDebito - totalCredito) < 0.01

  return (
    <div className="space-y-4">
      {/* Resumen global */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm">
        <span className="text-[#64748B]">{asientos.length} asientos</span>
        <span className="text-[#64748B]">Débito <strong className="text-[#0F172A] tabular-nums">{formatCOP(totalDebito)}</strong></span>
        <span className="text-[#64748B]">Crédito <strong className="text-[#0F172A] tabular-nums">{formatCOP(totalCredito)}</strong></span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cuadraGlobal ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {cuadraGlobal ? '✓ cuadra' : '⚠ descuadrado'}
        </span>
      </div>

      {/* Filtro por tipo */}
      <div className="flex flex-wrap gap-1.5">
        <FiltroChip label={`Todos (${asientos.length})`} activo={filtro === 'TODOS'} onClick={() => setFiltro('TODOS')} />
        {tipos.map(([t, n]) => (
          <FiltroChip key={t} label={`${t} (${n})`} activo={filtro === t} onClick={() => setFiltro(t)} />
        ))}
      </div>

      {/* Bloques por asiento */}
      <div className="space-y-3">
        {visibles.map(a => {
          const cuadra = Math.abs(a.totalDebito - a.totalCredito) < 0.01
          return (
            <div key={a.id} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              {/* Encabezado */}
              <div className="flex items-start justify-between gap-3 px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-[#64748B] tabular-nums whitespace-nowrap">{a.fecha}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${TIPO_COLOR[a.tipo] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}
                    title={tipoNombre[a.tipo] ?? a.tipo}>
                    {a.comprobante}
                  </span>
                  <span className="text-xs text-[#475569] truncate">{a.descripcion}</span>
                </div>
              </div>
              {/* Líneas */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#94A3B8] text-[11px] uppercase tracking-wide">
                      <th className="text-left font-medium px-4 py-1.5">Cuenta</th>
                      <th className="text-left font-medium px-3 py-1.5">Tercero</th>
                      <th className="text-left font-medium px-3 py-1.5">C. costo</th>
                      <th className="text-right font-medium px-3 py-1.5">Débito</th>
                      <th className="text-right font-medium px-4 py-1.5">Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.lineas.map((l, i) => (
                      <tr key={i} className="border-t border-[#F1F5F9]">
                        <td className="px-4 py-1.5">
                          <span className="tabular-nums text-[#0F172A] font-medium">{l.cuenta}</span>
                          <span className="text-[#64748B] ml-2">{l.cuentaNombre}</span>
                        </td>
                        <td className="px-3 py-1.5 text-[#475569]">{l.tercero ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[#94A3B8] whitespace-nowrap">{l.centroCosto ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{l.debito > 0 ? formatCOP(l.debito) : ''}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{l.credito > 0 ? formatCOP(l.credito) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#E2E8F0] font-semibold">
                      <td className="px-4 py-1.5 text-[#64748B] text-xs" colSpan={3}>
                        Total {a.lineas.length} línea{a.lineas.length !== 1 ? 's' : ''}
                        <span className={`ml-2 font-medium ${cuadra ? 'text-emerald-600' : 'text-red-600'}`}>{cuadra ? '· cuadra ✓' : '· descuadrado ⚠'}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(a.totalDebito)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(a.totalCredito)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FiltroChip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
        activo ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
      }`}>
      {label}
    </button>
  )
}
