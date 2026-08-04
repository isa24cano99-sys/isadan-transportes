'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { emitirViajesAction, type EmisionResultado } from './actions'

type Viaje = {
  id: string; tripNumber: string; fecha: string
  flete: number; cliente: string; feit: string
}

export default function EmisionClient({ viajes }: { viajes: Viaje[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<EmisionResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === viajes.length ? new Set() : new Set(viajes.map(v => v.id))))

  const totalSel = viajes.filter(v => sel.has(v.id)).reduce((s, v) => s + v.flete, 0)

  const emitir = async (ids: string[]) => {
    const lista = viajes.filter(v => ids.includes(v.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await emitirViajesAction(lista.map(v => ({ id: v.id, tripNumber: v.tripNumber })))
    setResultados(res)
    setSel(new Set())
    setLoading(false)
    router.refresh() // los emitidos con éxito desaparecen de la lista
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
          No hay viajes pendientes de emitir.
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
                  <th className="text-left px-3 py-2.5 font-medium">Factura</th>
                  <th className="text-right px-3 py-2.5 font-medium">Monto</th>
                  <th className="w-16 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {viajes.map(v => (
                  <tr key={v.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(v.id)} onChange={() => toggle(v.id)} /></td>
                    <td className="px-3 py-2.5 font-medium text-[#0F172A] whitespace-nowrap">{v.tripNumber}</td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{v.fecha}</td>
                    <td className="px-3 py-2.5 text-[#0F172A]">{v.cliente}</td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{v.feit}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(v.flete)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => emitir([v.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Emitir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
            <button onClick={() => emitir([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Emitiendo…' : 'Emitir seleccionados'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
