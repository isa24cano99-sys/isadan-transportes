'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearPorcentajeAction, type PorcentajeResultado } from './actions'

type Elegible = {
  id: string
  fecha: string
  conductor: string
  driverId: string
  sinTercero: boolean
  placa: string
  monto: number
}

export default function PorcentajeClient({ elegibles }: { elegibles: Elegible[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<PorcentajeResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === elegibles.length ? new Set() : new Set(elegibles.map(e => e.id))))

  const totalSel = elegibles.filter(e => sel.has(e.id)).reduce((s, e) => s + e.monto, 0)

  const postear = async (ids: string[]) => {
    const lista = elegibles.filter(e => ids.includes(e.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await postearPorcentajeAction(lista.map(e => ({
      id: e.id, driverId: e.driverId, placa: e.placa, monto: e.monto, fecha: e.fecha,
      ref: `${e.conductor} · ${e.placa} · ${e.fecha}`,
    })))
    setResultados(res)
    setSel(new Set())
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {resultados.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Resultado</p>
          {resultados.map(r => (
            <p key={r.id} className={`text-sm flex items-start gap-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className="font-semibold shrink-0">{r.ref}</span>
              <span>{r.ok ? '✓' : '✗'} {r.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {elegibles.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay porcentajes de conductor pendientes de contabilizar.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-xs">
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={sel.size === elegibles.length && elegibles.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium">Conductor</th>
                  <th className="text-left px-3 py-2.5 font-medium">Placa</th>
                  <th className="text-right px-3 py-2.5 font-medium">Monto</th>
                  <th className="w-16 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {elegibles.map(e => (
                  <tr key={e.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{e.fecha}</td>
                    <td className="px-3 py-2.5 text-[#0F172A]">
                      {e.conductor}
                      {e.sinTercero && <span className="ml-2 text-xs text-red-600">⚠ sin tercero</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{e.placa || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#0F172A] whitespace-nowrap">{formatCOP(e.monto)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => postear([e.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionada(s) · {formatCOP(totalSel)}</span>
            <button onClick={() => postear([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Contabilizando…' : 'Contabilizar seleccionada(s)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
