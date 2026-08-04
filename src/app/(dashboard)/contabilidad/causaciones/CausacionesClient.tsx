'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { causarViajesAction, type CausacionResultado } from './actions'

type Viaje = {
  id: string; tripNumber: string; status: string; fecha: string
  flete: number; cliente: string; placa: string | null; conductor: string | null
}

export default function CausacionesClient({ viajes }: { viajes: Viaje[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<CausacionResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === viajes.length ? new Set() : new Set(viajes.map(v => v.id))))

  const totalSel = viajes.filter(v => sel.has(v.id)).reduce((s, v) => s + v.flete, 0)

  const causar = async (ids: string[]) => {
    const lista = viajes.filter(v => ids.includes(v.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await causarViajesAction(lista.map(v => ({ id: v.id, tripNumber: v.tripNumber })))
    setResultados(res)
    setSel(new Set())
    setLoading(false)
    router.refresh() // recarga la lista: los causados con éxito desaparecen
  }

  return (
    <div className="space-y-4">
      {resultados.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Resultado</p>
          {resultados.map(r => (
            <p key={r.tripId} className={`text-sm flex items-start gap-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className="font-semibold shrink-0">{r.tripNumber}</span>
              <span>{r.ok ? '✓' : '✗'} {r.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {viajes.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay viajes pendientes de causar.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-xs">
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={sel.size === viajes.length && viajes.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">Viaje</th>
                  <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-medium">Placa / conductor</th>
                  <th className="text-right px-3 py-2.5 font-medium">Flete</th>
                  <th className="w-16 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {viajes.map(v => (
                  <tr key={v.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(v.id)} onChange={() => toggle(v.id)} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-[#0F172A]">{v.tripNumber}</span>
                      <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${v.status === 'FACTURADO' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{v.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{v.fecha}</td>
                    <td className="px-3 py-2.5 text-[#0F172A]">{v.cliente}</td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{v.placa ?? v.conductor ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(v.flete)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => causar([v.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Causar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
            <button onClick={() => causar([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Causando…' : 'Causar seleccionados'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
