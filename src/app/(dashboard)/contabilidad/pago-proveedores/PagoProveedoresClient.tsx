'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearPagoProveedorAction, postearGastoDirectoAction, postearGastosConsolidadosAction, postearTransferenciaInternaAction, postearIngresoFinancieroAction, type PagoResultado } from './actions'

type PagoRow    = { id: string; fecha: string; monto: number; tercero: string; descripcion: string }
type GastoRow   = PagoRow & { categoria: string; puc: string; exigeCeco: boolean }
type InternoRow = { id: string; fecha: string; monto: number; descripcion: string; categoria: string; direccion: string }
type IngresoRow = { id: string; fecha: string; monto: number; descripcion: string; categoria: string; puc: string }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function PagoProveedoresClient({ pagos, gastos, internos, ingresos, mesInicial, placas }: { pagos: PagoRow[]; gastos: GastoRow[]; internos: InternoRow[]; ingresos: IngresoRow[]; mesInicial: string; placas: string[] }) {
  const router = useRouter()
  const [year, setYear]   = useState(Number(mesInicial.slice(0, 4)))
  const [month, setMonth] = useState(Number(mesInicial.slice(5, 7)))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<PagoResultado[]>([])
  const [descripcion, setDescripcion] = useState('')
  const [fechaGrupo, setFechaGrupo] = useState('')
  const [cecoById, setCecoById] = useState<Map<string, string>>(new Map())  // gasto id → placa (centro de costo)

  // Filtro de mes: solo se muestran las candidatas del mes seleccionado (no se mezclan meses).
  const mes = `${year}-${String(month).padStart(2, '0')}`
  const pagos_ = useMemo(() => pagos.filter(p => p.fecha.slice(0, 7) === mes), [pagos, mes])
  const gastos_ = useMemo(() => gastos.filter(g => g.fecha.slice(0, 7) === mes), [gastos, mes])
  const internos_ = useMemo(() => internos.filter(t => t.fecha.slice(0, 7) === mes), [internos, mes])
  const ingresos_ = useMemo(() => ingresos.filter(i => i.fecha.slice(0, 7) === mes), [ingresos, mes])
  const cambiarMes = (y: number, m: number) => { setYear(y); setMonth(m); setSel(new Set()); setDescripcion(''); setFechaGrupo(''); setCecoById(new Map()) }

  // gastos cuya cuenta exige centro de costo (placa) + helper para fijarla
  const cecoRequerido = useMemo(() => new Set(gastos_.filter(g => g.exigeCeco).map(g => g.id)), [gastos_])
  const setCeco = (id: string, placa: string) =>
    setCecoById(prev => { const n = new Map(prev); placa ? n.set(id, placa) : n.delete(id); return n })

  // índices id → tipo/ref/monto/fecha para despachar al RPC correcto y sumar totales
  const meta = useMemo(() => {
    const m = new Map<string, { tipo: 'pago' | 'gasto' | 'interno' | 'ingreso'; ref: string; monto: number; fecha: string }>()
    pagos_.forEach(p => m.set(p.id, { tipo: 'pago', ref: `${p.tercero} · ${p.fecha}`, monto: p.monto, fecha: p.fecha }))
    gastos_.forEach(g => m.set(g.id, { tipo: 'gasto', ref: `${g.categoria} · ${g.fecha}`, monto: g.monto, fecha: g.fecha }))
    internos_.forEach(t => m.set(t.id, { tipo: 'interno', ref: `${t.direccion} · ${t.fecha}`, monto: t.monto, fecha: t.fecha }))
    ingresos_.forEach(i => m.set(i.id, { tipo: 'ingreso', ref: `${i.categoria} · ${i.fecha}`, monto: i.monto, fecha: i.fecha }))
    return m
  }, [pagos_, gastos_, internos_, ingresos_])

  // selección de GASTOS (para consolidar): default fecha = la más tardía; guard mismo mes
  const selGasto = useMemo(() => [...sel].filter(id => meta.get(id)?.tipo === 'gasto'), [sel, meta])
  const fechaDefault = useMemo(() => {
    const fs = selGasto.map(id => meta.get(id)!.fecha).sort()
    return fs.length ? fs[fs.length - 1] : ''
  }, [selGasto, meta])
  const fechaEfectiva = fechaGrupo || fechaDefault
  const mesesGasto = useMemo(() => new Set(selGasto.map(id => meta.get(id)!.fecha.slice(0, 7))), [selGasto, meta])
  const totalGasto = selGasto.reduce((s, id) => s + (meta.get(id)?.monto ?? 0), 0)

  // gastos agrupados por categoría
  const grupos = useMemo(() => {
    const g = new Map<string, GastoRow[]>()
    for (const row of gastos_) { const k = `${row.categoria}||${row.puc}`; (g.get(k) ?? g.set(k, []).get(k)!).push(row) }
    return [...g.entries()].map(([k, rows]) => ({ categoria: k.split('||')[0], puc: k.split('||')[1], rows }))
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [gastos_])

  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleMany = (ids: string[], on: boolean) =>
    setSel(p => { const n = new Set(p); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n })

  const totalSel = [...sel].reduce((s, id) => s + (meta.get(id)?.monto ?? 0), 0)

  const postear = async (ids: string[]) => {
    if (!ids.length || loading) return
    const pagoIds  = ids.filter(id => meta.get(id)?.tipo === 'pago')
    const gastoIds = ids.filter(id => meta.get(id)?.tipo === 'gasto')
    const internoIds = ids.filter(id => meta.get(id)?.tipo === 'interno')
    const ingresoIds = ids.filter(id => meta.get(id)?.tipo === 'ingreso')
    setLoading(true); setResultados([])
    const res: PagoResultado[] = []
    if (pagoIds.length)    res.push(...await postearPagoProveedorAction(pagoIds.map(id => ({ id, ref: meta.get(id)!.ref }))))
    if (gastoIds.length)   res.push(...await postearGastoDirectoAction(gastoIds.map(id => ({ id, ref: meta.get(id)!.ref, centroCosto: cecoById.get(id) }))))
    if (internoIds.length) res.push(...await postearTransferenciaInternaAction(internoIds.map(id => ({ id, ref: meta.get(id)!.ref }))))
    if (ingresoIds.length) res.push(...await postearIngresoFinancieroAction(ingresoIds.map(id => ({ id, ref: meta.get(id)!.ref }))))
    setResultados(res); setSel(new Set()); setLoading(false); router.refresh()
  }

  const postearConsolidado = async () => {
    if (selGasto.length < 2 || !descripcion.trim() || !fechaEfectiva || mesesGasto.size > 1 || loading) return
    setLoading(true); setResultados([])
    const res = await postearGastosConsolidadosAction(selGasto, descripcion.trim(), fechaEfectiva)
    setResultados([{ btId: 'grupo', ref: descripcion.trim(), ok: res.ok, mensaje: res.mensaje }])
    if (res.ok) { setSel(new Set()); setDescripcion(''); setFechaGrupo('') }
    setLoading(false); router.refresh()
  }

  const th = 'text-left px-3 py-2 text-[11px] font-medium text-[#64748B]'
  const chk = 'accent-[#2563EB]'
  // selector de placa (centro de costo) para filas cuya cuenta lo exige
  const cecoSelect = (id: string) => (
    <select value={cecoById.get(id) ?? ''} onChange={e => setCeco(id, e.target.value)}
      className="ml-2 border border-amber-300 rounded px-1.5 py-0.5 text-xs bg-amber-50 text-[#B45309]">
      <option value="">placa (ceco)…</option>
      {placas.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  )
  const Row = ({ r, extra, postDisabled }: { r: PagoRow; extra?: React.ReactNode; postDisabled?: boolean }) => (
    <tr className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
      <td className="px-3 py-2"><input type="checkbox" className={chk} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
      <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{r.fecha}</td>
      <td className="px-3 py-2 text-[#0F172A]">{r.tercero}{extra}</td>
      <td className="px-3 py-2 text-[#64748B] max-w-[220px] truncate">{r.descripcion || '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(r.monto)}</td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => postear([r.id])} disabled={loading || postDisabled}
          className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
      </td>
    </tr>
  )

  const nada = pagos_.length === 0 && gastos_.length === 0 && internos_.length === 0 && ingresos_.length === 0

  const selCls = 'border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  return (
    <div className="space-y-5">
      {/* Selector de mes: la lista solo muestra candidatas del mes elegido (no mezcla meses) */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[#64748B]">Mes:</span>
        <select className={selCls} value={month} onChange={e => cambiarMes(year, Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className={selCls} value={year} onChange={e => cambiarMes(Number(e.target.value), month)}>
          {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">· {pagos_.length} pago(s) · {gastos_.length} gasto(s) en {mes}</span>
      </div>

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
      {pagos_.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#EFF6FF] border-b border-[#DBEAFE]">
            <p className="text-sm font-semibold text-[#1D4ED8]">Pago a proveedor</p>
            <p className="text-[11px] text-[#3B82F6]">Cancela un pasivo ya causado · DB 220501 Proveedores / CR 11100510 Banco</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#E2E8F0]">
                <th className="w-9 px-3 py-2"><input type="checkbox" className={chk}
                  checked={pagos_.length > 0 && pagos_.every(p => sel.has(p.id))} onChange={e => toggleMany(pagos_.map(p => p.id), e.target.checked)} /></th>
                <th className={th}>Fecha</th><th className={th}>Proveedor</th><th className={th}>Descripción (banco)</th>
                <th className={`${th} text-right`}>Monto</th><th className="w-20 px-3 py-2"></th>
              </tr></thead>
              <tbody>{pagos_.map(r => <Row key={r.id} r={r} />)}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── SECCIÓN 2: GASTO DIRECTO ── */}
      {gastos_.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A]">
            <p className="text-sm font-semibold text-[#B45309]">Gasto directo</p>
            <p className="text-[11px] text-[#D97706]">Reconoce el gasto en el mismo instante · DB cuenta 5/6 / CR 11100510 Banco (sin pasivo intermedio)</p>
            <p className="text-[11px] text-[#B45309] mt-1 font-medium">💡 Marca 2 o más para <span className="underline">agruparlas en un solo asiento</span> (aparece un panel para ponerle nombre), o postéalas una por una.</p>
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
                    {g.rows.map(r => <Row key={r.id} r={r}
                      extra={r.exigeCeco ? cecoSelect(r.id) : undefined}
                      postDisabled={r.exigeCeco && !cecoById.get(r.id)} />)}
                  </tbody>
                )
              })}
            </table>
          </div>
        </section>
      )}

      {/* ── SECCIÓN 3: MOVIMIENTO INTERNO (banco ↔ caja) ── */}
      {internos_.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F0F9FF] border-b border-[#BAE6FD]">
            <p className="text-sm font-semibold text-[#0369A1]">Movimiento interno (banco ↔ caja)</p>
            <p className="text-[11px] text-[#0284C7]">Traslado de la propia plata entre cuentas de tesorería · ni gasto ni ingreso · dirección según el tipo del movimiento</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#E2E8F0]">
                <th className="w-9 px-3 py-2"><input type="checkbox" className={chk}
                  checked={internos_.length > 0 && internos_.every(t => sel.has(t.id))} onChange={e => toggleMany(internos_.map(t => t.id), e.target.checked)} /></th>
                <th className={th}>Fecha</th><th className={th}>Dirección</th><th className={th}>Descripción (banco)</th>
                <th className={`${th} text-right`}>Monto</th><th className="w-20 px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {internos_.map(t => (
                  <tr key={t.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2"><input type="checkbox" className={chk} checked={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{t.fecha}</td>
                    <td className="px-3 py-2"><span className="text-xs font-medium text-[#0369A1] bg-[#F0F9FF] border border-[#BAE6FD] rounded px-1.5 py-0.5">{t.direccion}</span></td>
                    <td className="px-3 py-2 text-[#64748B] max-w-[220px] truncate">{t.descripcion || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(t.monto)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => postear([t.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── SECCIÓN 4: INGRESO FINANCIERO ── */}
      {ingresos_.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#ECFDF5] border-b border-[#A7F3D0]">
            <p className="text-sm font-semibold text-[#047857]">Ingreso financiero</p>
            <p className="text-[11px] text-[#059669]">Un ingreso clase 4 que entra al banco (intereses, ajuste al peso…) · DB 11100510 Banco / CR cuenta de ingreso. El flete va por Facturación, no aquí.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#E2E8F0]">
                <th className="w-9 px-3 py-2"><input type="checkbox" className={chk}
                  checked={ingresos_.length > 0 && ingresos_.every(i => sel.has(i.id))} onChange={e => toggleMany(ingresos_.map(i => i.id), e.target.checked)} /></th>
                <th className={th}>Fecha</th><th className={th}>Concepto</th><th className={th}>Descripción (banco)</th>
                <th className={`${th} text-right`}>Monto</th><th className="w-20 px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {ingresos_.map(i => (
                  <tr key={i.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2"><input type="checkbox" className={chk} checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                    <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{i.fecha}</td>
                    <td className="px-3 py-2 text-[#0F172A]">{i.categoria} <span className="text-[#94A3B8] text-xs">· {i.puc}</span></td>
                    <td className="px-3 py-2 text-[#64748B] max-w-[220px] truncate">{i.descripcion || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(i.monto)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => postear([i.id])} disabled={loading}
                        className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-50">Contabilizar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Panel de consolidación — aparece al marcar ≥2 gastos */}
      {selGasto.length >= 2 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[#B45309]">
            Agrupar {selGasto.length} gastos en 1 solo asiento <span className="font-normal text-[#D97706]">· {formatCOP(totalGasto)}</span>
          </p>
          <p className="text-[11px] text-[#92400E]">
            Un comprobante con una línea de débito por cada gasto (a su cuenta) + una de crédito al banco por el total.
            El flujo individual sigue disponible con “Contabilizar seleccionadas”.
          </p>
          {mesesGasto.size > 1 ? (
            <p className="text-xs text-red-600">Los gastos seleccionados son de meses distintos ({[...mesesGasto].sort().join(', ')}). Un asiento consolidado debe ser de un solo mes.</p>
          ) : selGasto.some(id => cecoRequerido.has(id)) ? (
            <p className="text-xs text-red-600">Hay gastos seleccionados cuya cuenta exige centro de costo (placa) — esos van individuales con su placa, no en un asiento consolidado. Quítalos de la selección para agrupar el resto.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px]">
                <span className="block text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">Descripción del asiento</span>
                <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. GMF julio 2026"
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </label>
              <label>
                <span className="block text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">Fecha (más tardía)</span>
                <input type="date" value={fechaEfectiva} onChange={e => setFechaGrupo(e.target.value)}
                  className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </label>
              <button onClick={postearConsolidado} disabled={!descripcion.trim() || !fechaEfectiva || loading}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {loading ? 'Consolidando…' : `Contabilizar agrupados (${selGasto.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Barra de acción unificada (posteo individual) */}
      {!nada && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl sticky bottom-2 shadow-sm">
          <span className="text-xs text-[#64748B]">{sel.size} seleccionado(s) · {formatCOP(totalSel)}</span>
          <button onClick={() => postear([...sel])} disabled={!sel.size || loading}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {loading ? 'Contabilizando…' : 'Contabilizar seleccionadas (una por una)'}
          </button>
        </div>
      )}
    </div>
  )
}
