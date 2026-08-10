'use client'

import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import type { CuentaMayorRep } from '@/lib/contabilidad-reportes'

export default function LibroMayorClient({ cuentas, inicial }: { cuentas: CuentaMayorRep[]; inicial: string }) {
  const [sel, setSel] = useState(inicial)
  const cuenta = cuentas.find(c => c.cuenta === sel) ?? cuentas[0]

  if (!cuenta) return <p className="text-sm text-[#64748B]">No hay cuentas con movimiento en el periodo.</p>

  return (
    <div className="space-y-4">
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
          Saldo final: <strong className={`tabular-nums ${cuenta.saldoFinal < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(cuenta.saldoFinal)}</strong>
          <span className="text-xs text-[#94A3B8] ml-1">({cuenta.naturaleza === 'DEBITO' ? 'débito' : 'crédito'})</span>
        </span>
      </div>

      {cuenta.grupos.map((g, i) => (
        <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2">
            <span className="tabular-nums font-semibold text-[#0F172A]">{cuenta.cuenta}</span>
            <span className="text-sm text-[#475569]">{cuenta.nombre}</span>
            {cuenta.exigeTercero && (
              <span className="text-xs font-medium text-[#0369A1] bg-[#F0F9FF] border border-[#BAE6FD] rounded px-1.5 py-0.5">
                {g.tercero}{g.terceroNit ? ` · ${g.terceroNit}` : ''}
              </span>
            )}
            <span className="text-xs text-[#94A3B8] ml-auto">{g.movimientos.length} mov · saldo {formatCOP(g.saldoFinal)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-3 py-1.5">Fecha</th>
                  <th className="text-left font-medium px-3 py-1.5">Comprob.</th>
                  <th className="text-left font-medium px-3 py-1.5">Descripción</th>
                  <th className="text-right font-medium px-3 py-1.5">Débito</th>
                  <th className="text-right font-medium px-3 py-1.5">Crédito</th>
                  <th className="text-right font-medium px-3 py-1.5">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#F1F5F9] bg-[#FffBEB]/40">
                  <td colSpan={5} className="px-3 py-1.5 text-xs font-medium text-[#B45309]">Saldo anterior (apertura)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-[#B45309] whitespace-nowrap">{formatCOP(g.saldoAnterior)}</td>
                </tr>
                {g.movimientos.map((m, j) => (
                  <tr key={j} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-1.5 text-[#64748B] whitespace-nowrap">{m.fecha}</td>
                    <td className="px-3 py-1.5 text-[#64748B] whitespace-nowrap">{m.comprobante}</td>
                    <td className="px-3 py-1.5 text-[#475569] max-w-[280px] truncate">{m.descripcion || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{m.debito > 0 ? formatCOP(m.debito) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{m.credito > 0 ? formatCOP(m.credito) : '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${m.saldoCorriente < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(m.saldoCorriente)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                  <td colSpan={5} className="px-3 py-1.5 text-xs text-[#0F172A]">Saldo final</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${g.saldoFinal < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(g.saldoFinal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
