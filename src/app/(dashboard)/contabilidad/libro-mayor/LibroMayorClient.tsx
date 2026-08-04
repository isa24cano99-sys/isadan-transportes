'use client'

import { useState } from 'react'
import { formatCOP } from '@/lib/utils'

export type MovMayor = {
  fecha: string
  comprobante: string
  tipo: string
  descripcion: string
  tercero: string | null
  centroCosto: string | null
  debito: number
  credito: number
  saldoCorriente: number
  esApertura: boolean
}

export type CuentaMayor = {
  cuenta: string
  nombre: string
  naturaleza: string
  sumDebito: number
  sumCredito: number
  saldo: number
  movimientos: MovMayor[]
}

export default function LibroMayorClient({ cuentas, inicial }: { cuentas: CuentaMayor[]; inicial: string }) {
  const [sel, setSel] = useState(inicial)
  const cuenta = cuentas.find(c => c.cuenta === sel) ?? cuentas[0]

  if (!cuenta) return <p className="text-sm text-[#64748B]">No hay cuentas con movimiento.</p>

  return (
    <div className="space-y-4">
      {/* Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={sel} onChange={e => setSel(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white min-w-[22rem]"
        >
          {cuentas.map(c => (
            <option key={c.cuenta} value={c.cuenta}>{c.cuenta} · {c.nombre}</option>
          ))}
        </select>
        <span className="text-sm text-[#64748B]">
          Saldo: <strong className={`tabular-nums ${cuenta.saldo < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(cuenta.saldo)}</strong>
          <span className="text-xs text-[#94A3B8] ml-1">({cuenta.naturaleza === 'DEBITO' ? 'débito' : 'crédito'})</span>
        </span>
      </div>

      {/* Detalle */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2">
          <span className="tabular-nums font-semibold text-[#0F172A]">{cuenta.cuenta}</span>
          <span className="text-sm text-[#475569]">{cuenta.nombre}</span>
          <span className="text-xs text-[#94A3B8] ml-auto">{cuenta.movimientos.length} movimiento(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#94A3B8] text-[11px] uppercase tracking-wide border-b border-[#E2E8F0]">
                <th className="text-left font-medium px-4 py-1.5">Fecha</th>
                <th className="text-left font-medium px-3 py-1.5">Comp.</th>
                <th className="text-left font-medium px-3 py-1.5">Tercero</th>
                <th className="text-left font-medium px-3 py-1.5">C. costo</th>
                <th className="text-right font-medium px-3 py-1.5">Débito</th>
                <th className="text-right font-medium px-3 py-1.5">Crédito</th>
                <th className="text-right font-medium px-4 py-1.5">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {cuenta.movimientos.map((m, i) => (
                <tr key={i} className={`border-b border-[#F1F5F9] last:border-0 ${m.esApertura ? 'bg-purple-50/60' : 'hover:bg-[#F8FAFC]'}`}>
                  <td className="px-4 py-1.5 text-[#64748B] tabular-nums whitespace-nowrap">{m.fecha}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="text-[#475569] tabular-nums">{m.comprobante}</span>
                    {m.esApertura && <span className="ml-1.5 text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">Apertura</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] max-w-[16rem] truncate" title={m.tercero ?? m.descripcion}>{m.tercero ?? '—'}</td>
                  <td className="px-3 py-1.5 text-[#94A3B8] whitespace-nowrap">{m.centroCosto ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{m.debito > 0 ? formatCOP(m.debito) : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{m.credito > 0 ? formatCOP(m.credito) : ''}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums font-medium whitespace-nowrap ${m.saldoCorriente < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(m.saldoCorriente)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E2E8F0] font-semibold bg-[#F8FAFC]">
                <td className="px-4 py-1.5 text-[#64748B] text-xs" colSpan={4}>Totales</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(cuenta.sumDebito)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(cuenta.sumCredito)}</td>
                <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap ${cuenta.saldo < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(cuenta.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
