'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCOP } from '@/lib/utils'
import type { SaldoPeriodo } from '@/lib/contabilidad-reportes'

export default function BalanceClient({ filas }: { filas: SaldoPeriodo[] }) {
  const [q, setQ] = useState('')

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return filas
    return filas.filter(f => f.cuenta.includes(t) || f.nombre.toLowerCase().includes(t))
  }, [filas, q])

  const totD = filas.reduce((s, f) => s + f.debitoPeriodo, 0)
  const totC = filas.reduce((s, f) => s + f.creditoPeriodo, 0)
  const cuadra = Math.abs(totD - totC) < 0.01

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar cuenta o nombre…"
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm w-64 text-[#0F172A]"
        />
        <span className="text-xs text-[#64748B]">{visibles.length} de {filas.length} cuentas</span>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                <th className="text-left font-medium px-4 py-2">Cuenta</th>
                <th className="text-right font-medium px-3 py-2">Saldo anterior</th>
                <th className="text-right font-medium px-3 py-2">Débito periodo</th>
                <th className="text-right font-medium px-3 py-2">Crédito periodo</th>
                <th className="text-right font-medium px-4 py-2">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(f => (
                <tr key={f.cuenta} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2">
                    <Link href={`/contabilidad/libro-mayor?cuenta=${f.cuenta}`} className="group">
                      <span className="tabular-nums text-[#2563EB] font-medium group-hover:underline">{f.cuenta}</span>
                      <span className="text-[#64748B] ml-2">{f.nombre}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#64748B] whitespace-nowrap">{f.saldoAnterior !== 0 ? formatCOP(f.saldoAnterior) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{f.debitoPeriodo > 0 ? formatCOP(f.debitoPeriodo) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{f.creditoPeriodo > 0 ? formatCOP(f.creditoPeriodo) : '—'}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap ${f.saldoFinal < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(f.saldoFinal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E2E8F0] font-semibold bg-[#F8FAFC]">
                <td className="px-4 py-2.5 text-[#0F172A]">
                  Movimiento del periodo
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full border ${cuadra ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {cuadra ? '✓ cuadra' : '⚠ descuadrado'}
                  </span>
                </td>
                <td></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(totD)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(totC)}</td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
