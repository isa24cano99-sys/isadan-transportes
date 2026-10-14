'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearAnticipoConductorAction, asignarTerceroAction, type AnticipoResultado } from './actions'

type Movimiento = {
  id: string; fecha: string; monto: number; conductor: string; descripcion: string
}
type SinTercero = { id: string; fecha: string; monto: number; descripcion: string }
type Conductor = { id: string; nombre: string }

function FaltaTerceroSection({ rows, conductores }: { rows: SinTercero[]; conductores: Conductor[] }) {
  const router = useRouter()
  const [terByBt, setTerByBt] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const set = (id: string, t: string) => setTerByBt(p => { const n = new Map(p); t ? n.set(id, t) : n.delete(id); return n })
  const asignar = async (id: string) => {
    const t = terByBt.get(id); if (!t || busy) return
    setBusy(id)
    const r = await asignarTerceroAction(id, t)
    setBusy(null)
    if (r.ok) router.refresh()
  }
  if (rows.length === 0) return null
  return (
    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <p className="text-sm font-semibold text-amber-800">⚠ Falta tercero ({rows.length})</p>
        <p className="text-[11px] text-amber-700">Movimientos categorizados como anticipo a conductor pero sin conductor asignado — asígnalo aquí para poder contabilizarlos. No se contabilizan sin tercero.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#E2E8F0] text-[#64748B] text-xs">
            <th className="text-left px-3 py-2 font-medium">Fecha</th><th className="text-left px-3 py-2 font-medium">Descripción (banco)</th>
            <th className="text-right px-3 py-2 font-medium">Monto</th><th className="text-left px-3 py-2 font-medium">Conductor</th><th className="w-20 px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#FFFBEB]">
                <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{m.fecha}</td>
                <td className="px-3 py-2 text-[#64748B]">{m.descripcion || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(m.monto)}</td>
                <td className="px-3 py-2">
                  <select value={terByBt.get(m.id) ?? ''} onChange={e => set(m.id, e.target.value)}
                    className="border border-amber-300 rounded-lg px-2 py-1 text-xs bg-amber-50 text-[#B45309] max-w-[220px]">
                    <option value="">— elige conductor —</option>
                    {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => asignar(m.id)} disabled={!terByBt.get(m.id) || busy === m.id}
                    className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-40">{busy === m.id ? '…' : 'Asignar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AnticipoConductorClient({ movimientos, sinTercero, conductores }: { movimientos: Movimiento[]; sinTercero: SinTercero[]; conductores: Conductor[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<AnticipoResultado[]>([])

  const toggle = (id: string) =>
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSel(p => (p.size === movimientos.length ? new Set() : new Set(movimientos.map(m => m.id))))

  const totalSel = movimientos.filter(m => sel.has(m.id)).reduce((s, m) => s + m.monto, 0)

  const postear = async (ids: string[]) => {
    const lista = movimientos.filter(m => ids.includes(m.id))
    if (!lista.length || loading) return
    setLoading(true); setResultados([])
    const res = await postearAnticipoConductorAction(lista.map(m => ({ id: m.id, ref: `${m.conductor} · ${m.fecha}` })))
    setResultados(res)
    setSel(new Set())
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <FaltaTerceroSection rows={sinTercero} conductores={conductores} />

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
          No hay anticipos a conductor pendientes de contabilizar.
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
                  <th className="text-left px-3 py-2.5 font-medium">Conductor</th>
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
                    <td className="px-3 py-2.5 text-[#0F172A]">{m.conductor}</td>
                    <td className="px-3 py-2.5 text-[#64748B]">{m.descripcion || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(m.monto)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => postear([m.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
            <button onClick={() => postear([...sel])} disabled={!sel.size || loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {loading ? 'Contabilizando…' : 'Contabilizar anticipo(s) seleccionado(s)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
