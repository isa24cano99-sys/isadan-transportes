'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { registrarAnticiposAction, type ReciboResultado } from './actions'

type Movimiento = {
  id: string; fecha: string; monto: number; cliente: string; descripcion: string
}

export default function RecibosClient({ movimientos }: { movimientos: Movimiento[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<ReciboResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === movimientos.length ? new Set() : new Set(movimientos.map(m => m.id))))

  const totalSel = movimientos.filter(m => sel.has(m.id)).reduce((s, m) => s + m.monto, 0)

  const registrar = async (ids: string[]) => {
    const lista = movimientos.filter(m => ids.includes(m.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await registrarAnticiposAction(lista.map(m => ({ id: m.id, ref: `${m.cliente} · ${m.fecha}` })))
    setResultados(res)
    setSel(new Set())
    setLoading(false)
    router.refresh() // los registrados con éxito desaparecen de la lista
  }

  return (
    <div className="space-y-4">
      {resultados.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Resultado</p>
          {resultados.map(r => (
            <p key={r.btId} className={`text-sm flex items-start gap-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className="font-semibold shrink-0">{r.ref}</span>
              <span>{r.ok ? '✓' : '✗'} {r.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {movimientos.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay anticipos pendientes de registrar.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-xs">
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={sel.size === movimientos.length && movimientos.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-medium">Descripción (banco)</th>
                  <th className="text-right px-3 py-2.5 font-medium">Monto</th>
                  <th className="w-20 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} /></td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{m.fecha}</td>
                    <td className="px-3 py-2.5 text-[#0F172A]">{m.cliente}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{m.descripcion || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(m.monto)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => registrar([m.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Registrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
            <button onClick={() => registrar([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Registrando…' : 'Registrar anticipo(s) seleccionado(s)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
