'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import type { PYLData, RawTx, RawLegExp, RawToll, RawInvoice } from './page'

// ── Constantes ────────────────────────────────────────────────────────────────

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const PUC_NAMES: Record<string, string> = {
  '41450510': 'Fletes terrestres', '28050510': 'Anticipo clientes',
  '61450510': 'Combustible (ACPM)', '61450525': 'Comisión empresa', '61450530': 'Cargue',
  '61450535': 'Descargue', '61450545': 'Lubricantes / Engrase', '61450550': 'Lavada',
  '61450555': 'Llantas', '61450560': 'Parqueos', '61450565': 'Varadas', '61450570': 'Carrozada',
  '61450572': 'Descarrozada', '61450575': 'Peajes (Flypass)', '61450585': 'Otras compras',
  '61001510': 'Pago conductor (% flete)',
  '52050610': 'Sueldos y salarios', '52059510': 'Aportes seg. social', '52056810': 'ARL',
  '52057010': 'Pensión', '52057210': 'CCF', '52056910': 'Salud EPS', '52053010': 'Cesantías',
  '52053610': 'Prima de servicios', '52053910': 'Vacaciones', '52052710': 'Horas extras',
  '52058410': 'Dotación', '52058495': 'Otros beneficios',
  '52201005': 'Arrendamientos', '52304010': 'Seguros', '52352010': 'Servicios públicos',
  '52353010': 'Comunicaciones', '52353510': 'Aseo y vigilancia', '52401005': 'Honorarios',
  '52950510': 'Gastos de representación', '52956010': 'Otros gastos adm.', '51103010': 'Mantenimiento',
  '53050505': 'GMF (4x1000)', '53050510': 'Cuota de manejo', '53152010': 'IVA no deducible',
  '51150510': 'ICA Régimen Simple', '42100510': 'Intereses bancarios',
  '52959510': 'Gastos pers. propietario', '52959511': 'Gastos pers. propietario',
  '52959505': 'Gastos pers. propietario', '52959507': 'Gastos pers. propietario',
  '52959520': 'Gastos pers. propietario', '52959530': 'Gastos pers. propietario',
  '52959535': 'Gastos pers. propietario', '13301510': 'Anticipos no legalizados',
}

const EXP_TYPE_TO_PUC: Record<string, string> = {
  acpm_contado: '61450510', peajes: '61450575', cargue: '61450530', descargue: '61450535',
  comision_empresa: '61450525', llantas: '61450555', engrase: '61450545', cambio_aceite: '61450545',
  lavada: '61450550', parqueos: '61450560', carrozada: '61450570', descarrozada: '61450572',
  varada: '61450565', varadas: '61450565', otros: '61450585', porcentaje: '61001510',
}

function expToPuc(t: string): string {
  if (!t) return '61450585'
  if (/^\d{7,}$/.test(t)) return t
  return EXP_TYPE_TO_PUC[t.toLowerCase()] ?? '61450585'
}
const pucName = (c: string) => PUC_NAMES[c] ?? c

// ── Vectores por mes (índice 1..12) ───────────────────────────────────────────

type Vals = number[]
const zeros = (): Vals => Array(13).fill(0)
const sumVals = (v: Vals) => v.reduce((s, x) => s + x, 0)
const addV = (a: Vals, b: Vals): Vals => a.map((x, i) => x + b[i])
const subV = (a: Vals, b: Vals): Vals => a.map((x, i) => x - b[i])

type Grupo = { label: string; puc?: string; vals: Vals }

function groupBy<T extends { month: number; amount: number }>(
  rows: T[], keyOf: (t: T) => string, labelOf: (t: T) => string, pucOf?: (t: T) => string,
): Grupo[] {
  const m = new Map<string, Grupo>()
  for (const r of rows) {
    const k = keyOf(r)
    let g = m.get(k)
    if (!g) { g = { label: labelOf(r), puc: pucOf?.(r), vals: zeros() }; m.set(k, g) }
    g.vals[r.month] += r.amount
  }
  return [...m.values()].sort((a, b) => sumVals(b.vals) - sumVals(a.vals))
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ── Modelo de filas ───────────────────────────────────────────────────────────

type Kind = 'section' | 'group' | 'child' | 'leaf' | 'total' | 'result'
type Line = {
  key: string
  parent?: string
  label: string
  puc?: string
  level: number
  vals: Vals
  kind: Kind
  collapsible?: boolean
  noValues?: boolean
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function EstadoResultadosClient({
  year, availableYears,
  invoices, anticipos, legExps, tolls,
  personalCosts, generalCosts, financialExps, financialIncs,
  taxes, personalOwner,
}: PYLData) {
  const router = useRouter()
  const [sel, setSel]           = useState<Set<number>>(new Set())   // vacío = año completo (solo TOTAL)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const toggle = useCallback((k: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }, [])

  const toggleMonth = (m: number) => {
    setSel(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n })
  }

  // Meses mostrados como columnas y meses sumados en TOTAL
  const monthsShown = useMemo(() => [...sel].sort((a, b) => a - b), [sel])
  const totalMonths = monthsShown.length ? monthsShown : [1,2,3,4,5,6,7,8,9,10,11,12]

  // ── Construcción del árbol de líneas ────────────────────────────────────────
  const lines = useMemo<Line[]>(() => {
    const L: Line[] = []
    const push = (l: Line) => L.push(l)

    // INGRESOS
    const facturados = groupBy(invoices, i => i.clientNit ?? i.clientName, i => i.clientName)
    const antNodes   = groupBy(anticipos, a => a.supplierName ?? a.description ?? '(sin proveedor)',
                                          a => a.supplierName ?? a.description ?? '(sin proveedor)')
    const facVals = facturados.reduce((s, n) => addV(s, n.vals), zeros())
    const antVals = antNodes.reduce((s, n) => addV(s, n.vals), zeros())
    const ingresosVals = addV(facVals, antVals)

    push({ key: 'sec_inc', label: 'INGRESOS', level: 0, kind: 'section', vals: zeros(), noValues: true })
    push({ key: 'g_fact', label: 'Ingresos Facturados', puc: '41450510', level: 1, kind: 'group', vals: facVals, collapsible: true })
    facturados.forEach((n, i) => push({ key: `fact_${i}`, parent: 'g_fact', label: n.label, level: 2, kind: 'child', vals: n.vals }))
    push({ key: 'g_ant', label: 'Anticipos No Facturados', puc: '28050510', level: 1, kind: 'group', vals: antVals, collapsible: true })
    antNodes.forEach((n, i) => push({ key: `ant_${i}`, parent: 'g_ant', label: n.label, level: 2, kind: 'child', vals: n.vals }))
    push({ key: 't_inc', label: 'TOTAL INGRESOS', level: 0, kind: 'total', vals: ingresosVals })

    // COSTOS OPERACIONALES
    const plates = [...new Set(legExps.map(e => e.plate ?? 'Sin asignación'))]
    const plateNodes = plates.map(plate => {
      const rows = legExps.filter(e => (e.plate ?? 'Sin asignación') === plate)
      const exp  = groupBy(rows, e => expToPuc(e.expenseType), e => pucName(expToPuc(e.expenseType)), e => expToPuc(e.expenseType))
      return { plate, vals: exp.reduce((s, n) => addV(s, n.vals), zeros()), exp }
    }).sort((a, b) => sumVals(b.vals) - sumVals(a.vals))
    const legVals  = plateNodes.reduce((s, n) => addV(s, n.vals), zeros())
    const tollNodes = groupBy(tolls, t => t.plate ?? 'Sin placa', t => t.plate ?? 'Sin placa')
    const tollVals = tollNodes.reduce((s, n) => addV(s, n.vals), zeros())
    const costosVals = addV(legVals, tollVals)

    push({ key: 'sec_cos', label: 'COSTOS OPERACIONALES', level: 0, kind: 'section', vals: zeros(), noValues: true })
    push({ key: 'g_veh', label: 'Costos por Vehículo', level: 1, kind: 'group', vals: legVals, collapsible: true })
    plateNodes.forEach((p, i) => {
      push({ key: `veh_${i}`, parent: 'g_veh', label: p.plate, level: 2, kind: 'child', vals: p.vals, collapsible: true })
      p.exp.forEach((e, j) => push({ key: `veh_${i}_${j}`, parent: `veh_${i}`, label: e.label, puc: e.puc, level: 3, kind: 'leaf', vals: e.vals }))
    })
    push({ key: 'g_toll', label: 'Peajes Flypass', puc: '61450575', level: 1, kind: 'group', vals: tollVals, collapsible: true })
    tollNodes.forEach((n, i) => push({ key: `toll_${i}`, parent: 'g_toll', label: n.label, level: 2, kind: 'child', vals: n.vals }))
    push({ key: 't_cos', label: 'TOTAL COSTOS', level: 0, kind: 'total', vals: costosVals })

    // UTILIDAD BRUTA
    const utilBruta = subV(ingresosVals, costosVals)
    push({ key: 'r_bruta', label: 'UTILIDAD BRUTA', level: 0, kind: 'result', vals: utilBruta })

    // GASTOS OPERACIONALES
    const pers = groupBy(personalCosts, t => t.pucCode, t => pucName(t.pucCode), t => t.pucCode)
    const gen  = groupBy(generalCosts,  t => t.pucCode, t => pucName(t.pucCode), t => t.pucCode)
    const persVals = pers.reduce((s, n) => addV(s, n.vals), zeros())
    const genVals  = gen.reduce((s, n) => addV(s, n.vals), zeros())
    const gastosVals = addV(persVals, genVals)

    push({ key: 'sec_gop', label: 'GASTOS OPERACIONALES', level: 0, kind: 'section', vals: zeros(), noValues: true })
    push({ key: 'g_pers', label: 'Costos de Personal', level: 1, kind: 'group', vals: persVals, collapsible: true })
    pers.forEach((n, i) => push({ key: `pers_${i}`, parent: 'g_pers', label: n.label, puc: n.puc, level: 2, kind: 'leaf', vals: n.vals }))
    push({ key: 'g_gen', label: 'Gastos Generales', level: 1, kind: 'group', vals: genVals, collapsible: true })
    gen.forEach((n, i) => push({ key: `gen_${i}`, parent: 'g_gen', label: n.label, puc: n.puc, level: 2, kind: 'leaf', vals: n.vals }))
    push({ key: 't_gop', label: 'TOTAL GASTOS', level: 0, kind: 'total', vals: gastosVals })

    // UTILIDAD OPERACIONAL
    const utilOp = subV(utilBruta, gastosVals)
    push({ key: 'r_op', label: 'UTILIDAD OPERACIONAL', level: 0, kind: 'result', vals: utilOp })

    // GASTOS FINANCIEROS
    const finExp = groupBy(financialExps, t => t.pucCode, t => pucName(t.pucCode), t => t.pucCode)
    const finExpVals = finExp.reduce((s, n) => addV(s, n.vals), zeros())
    const finIncVals = financialIncs.reduce((v, t) => { v[t.month] += t.amount; return v }, zeros())
    const netoFin = subV(finIncVals, finExpVals)

    push({ key: 'sec_fin', label: 'GASTOS FINANCIEROS', level: 0, kind: 'section', vals: zeros(), noValues: true })
    finExp.forEach((n, i) => push({ key: `fin_${i}`, label: n.label, puc: n.puc, level: 1, kind: 'leaf', vals: n.vals }))
    if (sumVals(finIncVals) !== 0) push({ key: 'fin_inc', label: 'Ingresos financieros', puc: '42100510', level: 1, kind: 'leaf', vals: finIncVals })
    push({ key: 't_fin', label: 'NETO FINANCIERO', level: 0, kind: 'total', vals: netoFin })

    // IMPUESTOS
    const taxVals = taxes.reduce((v, t) => { v[t.month] += t.amount; return v }, zeros())
    push({ key: 't_imp', label: 'IMPUESTOS (ICA/RST)', puc: '51150510', level: 0, kind: 'total', vals: taxVals })

    // UTILIDAD NETA
    const utilNeta = subV(addV(utilOp, netoFin), taxVals)
    push({ key: 'r_neta', label: 'UTILIDAD NETA', level: 0, kind: 'result', vals: utilNeta })

    // GASTOS PERSONALES (fuera del resultado)
    const own = groupBy(personalOwner, t => t.pucCode, t => pucName(t.pucCode), t => t.pucCode)
    const ownVals = own.reduce((s, n) => addV(s, n.vals), zeros())
    push({ key: 'sec_own', label: 'GASTOS PERSONALES (fuera del resultado)', level: 0, kind: 'section', vals: zeros(), noValues: true })
    own.forEach((n, i) => push({ key: `own_${i}`, label: n.label, puc: n.puc, level: 1, kind: 'leaf', vals: n.vals }))
    push({ key: 't_own', label: 'Total gastos personales', level: 0, kind: 'total', vals: ownVals })

    return L
  }, [invoices, anticipos, legExps, tolls, personalCosts, generalCosts, financialExps, financialIncs, taxes, personalOwner])

  const lineByKey = useMemo(() => new Map(lines.map(l => [l.key, l])), [lines])

  const isVisible = useCallback((l: Line): boolean => {
    let p = l.parent
    while (p) { if (!expanded.has(p)) return false; p = lineByKey.get(p)?.parent }
    return true
  }, [expanded, lineByKey])

  const visibleLines = useMemo(() => lines.filter(isVisible), [lines, isVisible])

  const colTotal = (l: Line) => totalMonths.reduce((s, m) => s + l.vals[m], 0)

  // ── Excel ───────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const header = ['CONCEPTO', ...monthsShown.map(m => MESES_CORTOS[m - 1]), monthsShown.length ? 'TOTAL' : 'TOTAL AÑO']
      const rows: (string | number)[][] = [
        ['ISADAN TRANSPORTES S.A.S'], ['NIT: 902030120-8'], [`Estado de Resultados ${year}`], [], header,
      ]
      for (const l of lines) {
        const indent = '  '.repeat(l.level)
        if (l.noValues) { rows.push([indent + l.label]); continue }
        rows.push([indent + l.label, ...monthsShown.map(m => l.vals[m]), colTotal(l)])
      }
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 42 }, ...header.slice(1).map(() => ({ wch: 16 }))]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estado de Resultados')
      XLSX.writeFile(wb, `estado-resultados-${year}.xlsx`)
    } finally { setExporting(false) }
  }

  // ── Celdas ──────────────────────────────────────────────────────────────────
  const fmt = (v: number) => v === 0 ? '—' : COP.format(v)
  const cellCls = (v: number, bold: boolean) =>
    `px-3 py-1 text-right tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ` +
    (v === 0 ? 'text-[#CBD5E1]' : v < 0 ? 'text-red-600' : 'text-[#0F172A]')

  const rowBg = (k: Kind) =>
    k === 'result' ? 'bg-[#0F172A] text-white' :
    k === 'total'  ? 'bg-[#F1F5F9] font-semibold' :
    k === 'section'? 'bg-[#F8FAFC]' : 'hover:bg-[#F8FAFC]'

  const nCols = monthsShown.length + 1

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Estado de Resultados</h1>
          <p className="text-xs text-[#64748B] mt-0.5">ISADAN Transportes S.A.S — NIT 902030120-8</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => router.push(`/reportes?año=${e.target.value}`)}
            className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50">
            <Download size={14} /> {exporting ? 'Exportando…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Selector de meses */}
      <div className="flex flex-wrap gap-1 items-center">
        <button onClick={() => setSel(new Set())}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            sel.size === 0 ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#374151] hover:bg-[#E2E8F0]'
          }`}>
          Año completo
        </button>
        {MESES_CORTOS.map((label, i) => {
          const m = i + 1
          const on = sel.has(m)
          return (
            <button key={m} onClick={() => toggleMonth(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                on ? 'bg-[#2563EB] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#374151]'
              }`}>
              {label}
            </button>
          )
        })}
        <span className="ml-2 text-[11px] text-[#94A3B8]">
          {monthsShown.length ? `${monthsShown.length} mes(es) + Total` : 'Total del año'}
        </span>
      </div>

      {/* Tabla unificada */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[520px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider sticky left-0 bg-[#F8FAFC] min-w-[220px]">
                  Concepto
                </th>
                {monthsShown.map(m => (
                  <th key={m} className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider min-w-[110px]">
                    {MESES_CORTOS[m - 1]}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider min-w-[120px]">
                  {monthsShown.length ? 'Total' : `Total ${year}`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {visibleLines.map(l => {
                const bold = l.kind === 'total' || l.kind === 'result'
                const isResult = l.kind === 'result'
                const open = expanded.has(l.key)
                const total = colTotal(l)
                return (
                  <tr key={l.key} className={`${rowBg(l.kind)} transition-colors`}>
                    {/* Concepto */}
                    <td className={`px-3 py-1 sticky left-0 ${
                      isResult ? 'bg-[#0F172A]' : l.kind === 'total' ? 'bg-[#F1F5F9]' : l.kind === 'section' ? 'bg-[#F8FAFC]' : 'bg-white'
                    }`} style={{ paddingLeft: `${12 + l.level * 16}px` }}>
                      <div className="flex items-center gap-1.5">
                        {l.collapsible ? (
                          <button onClick={() => toggle(l.key)} className="shrink-0 text-[#94A3B8] hover:text-[#64748B]">
                            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        ) : l.kind === 'leaf' ? (
                          <span className="shrink-0 text-[#CBD5E1] text-xs w-3.5 text-center">·</span>
                        ) : <span className="w-3.5 shrink-0" />}
                        <span className={`truncate ${
                          l.kind === 'section' ? 'text-[11px] font-bold uppercase tracking-wide text-[#0F172A]' :
                          isResult ? 'text-sm font-bold text-white' :
                          l.kind === 'total' ? 'text-sm font-semibold text-[#0F172A]' :
                          l.kind === 'group' ? 'text-xs font-semibold text-[#0F172A]' :
                          'text-xs text-[#475569]'
                        }`}>
                          {l.label}
                          {l.puc && (l.kind === 'group' || l.kind === 'leaf') && (
                            <span className="ml-1.5 text-[10px] font-mono text-[#94A3B8] font-normal">{l.puc}</span>
                          )}
                        </span>
                      </div>
                    </td>
                    {/* Valores por mes */}
                    {l.noValues
                      ? <td colSpan={nCols} />
                      : <>
                          {monthsShown.map(m => (
                            <td key={m} className={isResult
                              ? `px-3 py-1 text-right tabular-nums whitespace-nowrap font-semibold ${l.vals[m] < 0 ? 'text-red-400' : l.vals[m] === 0 ? 'text-white/30' : 'text-green-400'}`
                              : `text-xs ${cellCls(l.vals[m], bold)}`}>
                              {fmt(l.vals[m])}
                            </td>
                          ))}
                          <td className={isResult
                            ? `px-3 py-1 text-right tabular-nums whitespace-nowrap font-bold ${total < 0 ? 'text-red-400' : total === 0 ? 'text-white/30' : 'text-green-400'}`
                            : `text-xs ${cellCls(total, true)}`}>
                            {fmt(total)}
                          </td>
                        </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
