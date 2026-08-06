'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { cerrarPeriodoAction, reabrirPeriodoAction, type CierreResultado } from './actions'

export type FilaPeriodo = {
  periodo: string
  estado: 'ABIERTO' | 'CERRADO'
  fechaCierre: string | null
  ingresos: number
  costos: number
  gastos: number
  utilidad: number
  ccConsecutivo: number | null
}

export default function CierrePeriodoClient({ filas }: { filas: FilaPeriodo[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [resultado, setResultado] = useState<CierreResultado | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const cerrar = async (periodo: string) => {
    setLoading(periodo); setResultado(null); setConfirmando(null)
    const res = await cerrarPeriodoAction(periodo)
    setResultado(res); setLoading(null)
    if (res.ok) router.refresh()
  }
  const reabrir = async (periodo: string) => {
    setLoading(periodo); setResultado(null)
    const res = await reabrirPeriodoAction(periodo)
    setResultado(res); setLoading(null)
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      {resultado && (
        <div className={`text-sm rounded-xl border p-4 ${resultado.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {resultado.ok ? '✓ ' : '✗ '}{resultado.mensaje}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay periodos con movimiento de resultado.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2">Periodo</th>
                  <th className="text-left font-medium px-3 py-2">Estado</th>
                  <th className="text-right font-medium px-3 py-2">Resultado</th>
                  <th className="w-52 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.periodo} className="border-b border-[#F1F5F9] last:border-0 align-top">
                    <td className="px-4 py-3 font-medium text-[#0F172A] tabular-nums">{f.periodo}</td>
                    <td className="px-3 py-3">
                      {f.estado === 'CERRADO' ? (
                        <div>
                          <span className="text-xs font-medium text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">Cerrado</span>
                          {f.ccConsecutivo != null && <div className="text-[10px] text-[#94A3B8] mt-1">asiento CC-{f.ccConsecutivo}{f.fechaCierre ? ` · ${f.fechaCierre.slice(0, 10)}` : ''}</div>}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Abierto</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`tabular-nums font-medium ${f.utilidad < 0 ? 'text-red-600' : 'text-[#0F172A]'}`}>{formatCOP(f.utilidad)}</span>
                      <div className="text-[10px] text-[#94A3B8]">ing {formatCOP(f.ingresos)} − cos {formatCOP(f.costos + f.gastos)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.estado === 'ABIERTO' ? (
                        confirmando === f.periodo ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-[#64748B]">¿Cerrar {f.periodo}?</span>
                            <button onClick={() => cerrar(f.periodo)} disabled={loading !== null}
                              className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium px-2.5 py-1 rounded-lg">
                              {loading === f.periodo ? '…' : 'Sí, cerrar'}
                            </button>
                            <button onClick={() => setConfirmando(null)} className="text-xs text-[#64748B] hover:underline">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmando(f.periodo)} disabled={loading !== null}
                            className="text-xs bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg">
                            Cerrar periodo
                          </button>
                        )
                      ) : (
                        <button onClick={() => reabrir(f.periodo)} disabled={loading !== null}
                          className="text-xs text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC] disabled:opacity-50 font-medium px-3 py-1.5 rounded-lg">
                          {loading === f.periodo ? '…' : 'Reabrir'}
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
