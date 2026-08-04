'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { cruzarCarteraAction, type CruceResultado } from './actions'

type Elegible = {
  id: string
  cliente: string
  factura: string
  saldoFactura: number
  anticipoDisp: number
  carteraTercero: number
  monto: number
}

export default function CruceClient({ elegibles }: { elegibles: Elegible[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<CruceResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === elegibles.length ? new Set() : new Set(elegibles.map(e => e.id))))

  const totalSel = elegibles.filter(e => sel.has(e.id)).reduce((s, e) => s + e.monto, 0)

  const cruzar = async (ids: string[]) => {
    const lista = elegibles.filter(e => ids.includes(e.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await cruzarCarteraAction(lista.map(e => ({ id: e.id, ref: `${e.cliente} · ${e.factura}` })))
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
            <p key={r.entryId} className={`text-sm flex items-start gap-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className="font-semibold shrink-0">{r.ref}</span>
              <span>{r.ok ? '✓' : '✗'} {r.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {elegibles.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay carteras con anticipo disponible para cruzar.
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
                  <th className="text-left px-3 py-2.5 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-medium">Factura</th>
                  <th className="text-right px-3 py-2.5 font-medium">Saldo factura</th>
                  <th className="text-right px-3 py-2.5 font-medium">Anticipo disp.</th>
                  <th className="text-right px-3 py-2.5 font-medium">A cruzar</th>
                  <th className="w-16 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {elegibles.map(e => (
                  <tr key={e.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className="px-3 py-2.5 text-[#0F172A]">{e.cliente}</td>
                    <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{e.factura}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#64748B] whitespace-nowrap">{formatCOP(e.saldoFactura)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#64748B] whitespace-nowrap">{formatCOP(e.anticipoDisp)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#0F172A] whitespace-nowrap">{formatCOP(e.monto)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => cruzar([e.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Cruzar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionada(s) · a cruzar {formatCOP(totalSel)}</span>
            <button onClick={() => cruzar([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Cruzando…' : 'Cruzar seleccionada(s)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
