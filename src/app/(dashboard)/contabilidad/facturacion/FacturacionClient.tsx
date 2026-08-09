'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP, formatDate } from '@/lib/utils'
import { FileText } from 'lucide-react'
import {
  enlazarNotaCreditoAction, postearNotaCreditoAction, enlazarViajeFacturaAction, postearFacturacionAction,
  type EmitidaFE, type NotaCreditoFE, type ViajeOption,
} from './actions'

export default function FacturacionClient({
  emitidas, notasCredito, viajes,
}: { emitidas: EmitidaFE[]; notasCredito: NotaCreditoFE[]; viajes: ViajeOption[] }) {
  const router = useRouter()
  const [fes, setFes] = useState<EmitidaFE[]>(emitidas)
  const [ncs, setNcs] = useState<NotaCreditoFE[]>(notasCredito)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const enlazarViaje = async (id: string, tripId: string) => {
    setBusy(id)
    const res = await enlazarViajeFacturaAction(id, tripId || null)
    if (res.ok) {
      const v = viajes.find(x => x.id === tripId)
      setFes(prev => prev.map(f => f.id === id ? { ...f, matchedTripId: tripId || null, viaje: v?.tripNumber ?? (f.viajeAuto ? f.viaje : null), viajeAuto: tripId ? false : f.viajeAuto } : f))
    } else setMsg({ ok: false, text: res.error ?? 'Error al enlazar' })
    setBusy(null)
  }
  const postearFE = async (id: string) => {
    setBusy(id); setMsg(null)
    const res = await postearFacturacionAction(id)
    setMsg({ ok: res.ok, text: res.mensaje })
    setBusy(null)
    if (res.ok) router.refresh()
  }
  const enlazarNC = async (ncId: string, feId: string) => {
    setBusy(ncId)
    const res = await enlazarNotaCreditoAction(ncId, feId || null)
    if (res.ok) {
      const fe = fes.find(e => e.id === feId)
      setNcs(prev => prev.map(n => n.id === ncId ? { ...n, feRelacionadaId: feId || null, feRelacionadaFolio: fe ? `${fe.prefix}${fe.folio}` : null } : n))
    } else setMsg({ ok: false, text: res.error ?? 'Error al enlazar' })
    setBusy(null)
  }
  const postearNC = async (ncId: string) => {
    setBusy(ncId); setMsg(null)
    const res = await postearNotaCreditoAction(ncId)
    setMsg({ ok: res.ok, text: res.mensaje })
    setBusy(null)
    if (res.ok) router.refresh()
  }

  const th = 'text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider'
  return (
    <div className="space-y-6">
      {msg && (
        <div className={`text-sm rounded-xl border p-3 ${msg.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {msg.ok ? '✓ ' : '✗ '}{msg.text}
        </div>
      )}

      {/* Facturas emitidas — reconocer ingreso */}
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A] mb-2">Facturas emitidas (FEIT) — reconocer ingreso</h2>
        {fes.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
            <FileText size={26} className="mx-auto mb-2 text-[#CBD5E1]" />
            <p className="text-sm text-[#64748B]">No hay facturas emitidas importadas. Súbelas en Conciliar costos DIAN.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className={th}>FEIT</th><th className={th}>Fecha</th><th className={th}>Cliente</th>
                <th className={`${th} text-right`}>Total</th><th className={th}>Viaje</th><th className={`${th} text-right`}>Ingreso</th>
              </tr></thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {fes.map(e => {
                  const anulada = /anul/i.test(e.status)
                  return (
                    <tr key={e.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-3 py-1.5 text-xs font-medium text-[#0F172A] whitespace-nowrap">{e.prefix}{e.folio}</td>
                      <td className="px-3 py-1.5 text-xs text-[#64748B] whitespace-nowrap">{e.issue_date ? formatDate(e.issue_date) : '—'}</td>
                      <td className="px-3 py-1.5 text-xs text-[#0F172A] max-w-[200px] truncate">{e.cliente}</td>
                      <td className="px-3 py-1.5 text-xs text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(e.total)}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {e.asiento ? (
                          <span className="text-[#64748B]">{e.viaje ?? '—'}</span>
                        ) : e.viaje ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[#0F172A]">{e.viaje}</span>
                            {e.viajeAuto && <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded" title="sugerido por el folio">auto</span>}
                          </span>
                        ) : (
                          <select value={e.matchedTripId ?? ''} disabled={busy === e.id}
                            onChange={ev => enlazarViaje(e.id, ev.target.value)}
                            className="border border-[#E2E8F0] rounded-lg px-2 py-1 text-xs bg-white max-w-[190px]">
                            <option value="">sin viaje asociado</option>
                            {viajes.filter(v => v.terceroId === e.terceroId).map(v => (
                              <option key={v.id} value={v.id}>{v.tripNumber} · {formatCOP(v.freight)}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {e.asiento ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ {e.asiento}</span>
                        ) : anulada ? (
                          <span className="text-[10px] text-red-600">anulada</span>
                        ) : (
                          <button onClick={() => postearFE(e.id)} disabled={busy === e.id}
                            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                            {busy === e.id ? '…' : 'Contabilizar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-[#94A3B8] px-3 py-2 border-t border-[#F1F5F9]">
              El viaje se sugiere por el folio (invoices → trip). Si no hay match, lo eliges a mano (mismo cliente) o lo dejas sin viaje — el ingreso se reconoce igual por la FEIT.
            </p>
          </div>
        )}
      </div>

      {/* Notas crédito emitidas — enlace MANUAL a su FE + contabilizar */}
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A] mb-2">Notas crédito emitidas</h2>
        {ncs.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 text-center">
            <p className="text-sm text-[#64748B]">No hay notas crédito emitidas este periodo.</p>
            <p className="text-xs text-[#94A3B8] mt-1">Cuando exista una, la enlazas manualmente a su factura original y se contabiliza (DB 41450510 / CR 13050501).</p>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className={th}>NC</th><th className={th}>Fecha</th><th className={th}>Cliente</th>
                <th className={`${th} text-right`}>Total</th><th className={th}>Factura original</th><th className={th}></th>
              </tr></thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {ncs.map(n => (
                  <tr key={n.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-1.5 text-xs font-medium text-[#0F172A] whitespace-nowrap">{n.prefix}{n.folio}</td>
                    <td className="px-3 py-1.5 text-xs text-[#64748B] whitespace-nowrap">{n.issue_date ? formatDate(n.issue_date) : '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-[#0F172A] max-w-[180px] truncate">{n.cliente}</td>
                    <td className="px-3 py-1.5 text-xs text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(n.total)}</td>
                    <td className="px-3 py-1.5">
                      {n.asiento ? <span className="text-xs text-[#64748B]">{n.feRelacionadaFolio}</span> : (
                        <select value={n.feRelacionadaId ?? ''} disabled={busy === n.id}
                          onChange={e => enlazarNC(n.id, e.target.value)}
                          className="border border-[#E2E8F0] rounded-lg px-2 py-1 text-xs bg-white max-w-[200px]">
                          <option value="">— Elegir factura original —</option>
                          {fes.filter(fe => fe.cliente === n.cliente).map(fe => (
                            <option key={fe.id} value={fe.id}>{fe.prefix}{fe.folio} · {formatCOP(fe.total)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {n.asiento ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ {n.asiento}</span>
                      ) : (
                        <button onClick={() => postearNC(n.id)} disabled={!n.feRelacionadaId || busy === n.id}
                          className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                          {busy === n.id ? '…' : 'Contabilizar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
