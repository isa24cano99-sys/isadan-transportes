'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearPagoProveedorAction, postearGastoDirectoAction, type PagoResultado } from './actions'

type PagoRow  = { id: string; fecha: string; monto: number; tercero: string; descripcion: string }
type GastoRow = PagoRow & { categoria: string; puc: string }

export default function PagoProveedoresClient({ pagos, gastos }: { pagos: PagoRow[]; gastos: GastoRow[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<PagoResultado[]>([])

  // índices id → tipo/ref/monto para despachar al RPC correcto y sumar totales
  const meta = useMemo(() => {
    const m = new Map<string, { tipo: 'pago' | 'gasto'; ref: string; monto: number }>()
    pagos.forEach(p => m.set(p.id, { tipo: 'pago', ref: `${p.tercero} · ${p.fecha}`, monto: p.monto }))
    gastos.forEach(g => m.set(g.id, { tipo: 'gasto', ref: `${g.categoria} · ${g.fecha}`, monto: g.monto }))
    return m
  }, [pagos, gastos])

  // gastos agrupados por categoría
  const grupos = useMemo(() => {
    const g = new Map<string, GastoRow[]>()
    for (const row of gastos) { const k = `${row.categoria}||${row.puc}`; (g.get(k) ?? g.set(k, []).get(k)!).push(row) }
    return [...g.entries()].map(([k, rows]) => ({ categoria: k.split('||')[0], puc: k.split('||')[1], rows }))
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [gastos])

  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleMany = (ids: string[], on: boolean) =>
    setSel(p => { const n = new Set(p); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n })

  const totalSel = [...sel].reduce((s, id) => s + (meta.get(id)?.monto ?? 0), 0)

  const postear = async (ids: string[]) => {
    if (!ids.length || loading) return
    const pagoIds  = ids.filter(id => meta.get(id)?.tipo === 'pago')
    const gastoIds = ids.filter(id => meta.get(id)?.tipo === 'gasto')
    setLoading(true); setResultados([])
    const res: PagoResultado[] = []
    if (pagoIds.length)  res.push(...await postearPagoProveedorAction(pagoIds.map(id => ({ id, ref: meta.get(id)!.ref }))))
    if (gastoIds.length) res.push(...await postearGastoDirectoAction(gastoIds.map(id => ({ id, ref: meta.get(id)!.ref }))))
    setResultados(res); setSel(new Set()); setLoading(false); router.refresh()
  }

  const th = 'text-left px-3 py-2 text-[11px] font-medium text-[#64748B]'
  const chk = 'accent-[#2563EB]'
  const Row = ({ r, extra }: { r: PagoRow; extra?: React.ReactNode }) => (
    <tr className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
      <td className="px-3 py-2"><input type="checkbox" className={chk} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
      <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{r.fecha}</td>
      <td className="px-3 py-2 text-[#0F172A]">{r.tercero}{extra}</td>
      <td className="px-3 py-2 text-[#64748B] max-w-[220px] truncate">{r.descripcion || '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(r.monto)}</td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => postear([r.id])} disabled={loading}
          className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
      </td>
    </tr>
  )

  const nada = pagos.length === 0 && gastos.length === 0

  return (
    <div className="space-y-5">
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

      {nada && (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay pagos ni gastos bancarios pendientes de contabilizar.
        </p>
      )}

      {/* ── SECCIÓN 1: PAGO A PROVEEDOR ── */}
      {pagos.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#EFF6FF] border-b border-[#DBEAFE]">
            <p className="text-sm font-semibold text-[#1D4ED8]">Pago a proveedor</p>
            <p className="text-[11px] text-[#3B82F6]">Cancela un pasivo ya causado · DB 220501 Proveedores / CR 11100510 Banco</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#E2E8F0]">
                <th className="w-9 px-3 py-2"><input type="checkbox" className={chk}
                  checked={pagos.every(p => sel.has(p.id))} onChange={e => toggleMany(pagos.map(p => p.id), e.target.checked)} /></th>
                <th className={th}>Fecha</th><th className={th}>Proveedor</th><th className={th}>Descripción (banco)</th>
                <th className={`${th} text-right`}>Monto</th><th className="w-20 px-3 py-2"></th>
              </tr></thead>
              <tbody>{pagos.map(r => <Row key={r.id} r={r} />)}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── SECCIÓN 2: GASTO DIRECTO ── */}
      {gastos.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A]">
            <p className="text-sm font-semibold text-[#B45309]">Gasto directo</p>
            <p className="text-[11px] text-[#D97706]">Reconoce el gasto en el mismo instante · DB cuenta 5/6 / CR 11100510 Banco (sin pasivo intermedio)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {grupos.map(g => {
                const ids = g.rows.map(r => r.id)
                const total = g.rows.reduce((s, r) => s + r.monto, 0)
                return (
                  <tbody key={g.puc + g.categoria} className="border-b border-[#E2E8F0] last:border-0">
                    <tr className="bg-[#F8FAFC]">
                      <td className="px-3 py-1.5"><input type="checkbox" className={chk}
                        checked={ids.every(id => sel.has(id))} onChange={e => toggleMany(ids, e.target.checked)} /></td>
                      <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
                        {g.categoria} <span className="text-[#94A3B8] font-normal">· {g.puc} · {g.rows.length} mov</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-[#0F172A]">{formatCOP(total)}</td>
                      <td></td>
                    </tr>
                    {g.rows.map(r => <Row key={r.id} r={r} />)}
                  </tbody>
                )
              })}
            </table>
          </div>
        </section>
      )}

      {/* Barra de acción unificada */}
      {!nada && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl sticky bottom-2 shadow-sm">
          <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
          <button onClick={() => postear([...sel])} disabled={!sel.size || loading}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {loading ? 'Contabilizando…' : 'Contabilizar seleccionadas'}
          </button>
        </div>
      )}
    </div>
  )
}
