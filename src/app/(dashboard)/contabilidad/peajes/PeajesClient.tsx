'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearPeajeMensualAction, type PeajeResultado } from './actions'

export type MesPeaje = {
  mes: string
  facturas: number
  notasCredito: number
  neto: number
  causado: boolean
}

export default function PeajesClient({ meses }: { meses: MesPeaje[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [resultado, setResultado] = useState<PeajeResultado | null>(null)

  const causar = async (mes: string) => {
    if (loading) return
    setLoading(mes); setResultado(null)
    const res = await postearPeajeMensualAction(mes)
    setResultado(res)
    setLoading(null)
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      {resultado && (
        <div className={`text-sm rounded-xl border p-4 ${resultado.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {resultado.ok ? '✓ ' : '✗ '}{resultado.mensaje}
        </div>
      )}

      {meses.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay meses con peaje F2X pendiente de causar.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2">Mes</th>
                  <th className="text-right font-medium px-3 py-2">Facturas</th>
                  <th className="text-right font-medium px-3 py-2">Notas crédito</th>
                  <th className="text-right font-medium px-3 py-2">Neto</th>
                  <th className="w-28 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {meses.map(m => (
                  <tr key={m.mes} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-medium text-[#0F172A] tabular-nums">{m.mes}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#64748B] whitespace-nowrap">{formatCOP(m.facturas)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#64748B] whitespace-nowrap">−{formatCOP(m.notasCredito)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#0F172A] whitespace-nowrap">{formatCOP(m.neto)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {m.causado ? (
                        <span className="text-xs text-emerald-700 font-medium">✓ Causado</span>
                      ) : (
                        <button onClick={() => causar(m.mes)} disabled={loading !== null}
                          className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                          {loading === m.mes ? 'Causando…' : 'Causar mes'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
