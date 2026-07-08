'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import type { PYLData, RawTx, RawLegExp, RawToll, RawInvoice } from './page'

// ── Constants ─────────────────────────────────────────────────────────────────

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const PUC_NAMES: Record<string, string> = {
  '41450510': 'Fletes terrestres',
  '28050510': 'Anticipo clientes',
  '61450510': 'Combustible (ACPM)',
  '61450525': 'Comisión empresa',
  '61450530': 'Cargue',
  '61450535': 'Descargue',
  '61450545': 'Lubricantes / Engrase',
  '61450550': 'Lavada',
  '61450555': 'Llantas',
  '61450560': 'Parqueos',
  '61450565': 'Varadas',
  '61450570': 'Carrozada',
  '61450572': 'Descarrozada',
  '61450575': 'Peajes (Flypass)',
  '61450585': 'Otras compras',
  '61001510': 'Pago conductor (% flete)',
  '52050610': 'Sueldos y salarios',
  '52059510': 'Aportes seg. social (total)',
  '52056810': 'ARL',
  '52057010': 'Pensión',
  '52057210': 'CCF',
  '52056910': 'Salud EPS',
  '52053010': 'Cesantías',
  '52053610': 'Prima de servicios',
  '52053910': 'Vacaciones',
  '52052710': 'Horas extras',
  '52058410': 'Dotación',
  '52058495': 'Otros beneficios',
  '52201005': 'Arrendamientos',
  '52304010': 'Seguros',
  '52352010': 'Servicios públicos',
  '52353010': 'Comunicaciones',
  '52353510': 'Aseo y vigilancia',
  '52401005': 'Honorarios',
  '52950510': 'Gastos de representación',
  '52956010': 'Otros gastos adm.',
  '51103010': 'Mantenimiento y reparaciones',
  '53050505': 'GMF (4x1000)',
  '53050510': 'Cuota de manejo',
  '53152010': 'IVA asumido no deducible',
  '51150510': 'ICA Régimen Simple',
  '42100510': 'Intereses bancarios',
  '52959510': 'Gastos pers. propietario',
  '52959511': 'Gastos pers. propietario',
  '52959505': 'Gastos pers. propietario',
  '52959507': 'Gastos pers. propietario',
  '52959520': 'Gastos pers. propietario',
  '52959530': 'Gastos pers. propietario',
  '52959535': 'Gastos pers. propietario',
  '13301510': 'Anticipos no legalizados',
}

const EXP_TYPE_TO_PUC: Record<string, string> = {
  acpm_contado:     '61450510',
  peajes:           '61450575',
  cargue:           '61450530',
  descargue:        '61450535',
  comision_empresa: '61450525',
  llantas:          '61450555',
  engrase:          '61450545',
  cambio_aceite:    '61450545',
  lavada:           '61450550',
  parqueos:         '61450560',
  carrozada:        '61450570',
  descarrozada:     '61450572',
  varada:           '61450565',
  varadas:          '61450565',
  otros:            '61450585',
  porcentaje:       '61001510',
}

export function expToPuc(expType: string): string {
  if (!expType) return '61450585'
  if (/^\d{7,}$/.test(expType)) return expType
  return EXP_TYPE_TO_PUC[expType.toLowerCase()] ?? '61450585'
}

function pucName(code: string): string {
  return PUC_NAMES[code] ?? code
}

// ── Formatters ────────────────────────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt    = (v: number) => v === 0 ? '—' : COP.format(v)
const fmtAbs = (v: number) => v === 0 ? '—' : COP.format(Math.abs(v))

function amtCls(v: number, bold = false) {
  return `${bold ? 'font-semibold' : ''} tabular-nums ${v < 0 ? 'text-red-600' : v > 0 ? 'text-[#0F172A]' : 'text-[#CBD5E1]'}`
}

// ── Module-level UI components (stable references) ────────────────────────────

function SectionRow({ open, onToggle, label, puc, amount, indent = 0 }: {
  open: boolean
  onToggle: () => void
  label: string
  puc?: string
  amount: number
  indent?: number
}) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 hover:bg-[#F8FAFC] cursor-pointer select-none group"
      style={{ paddingLeft: `${12 + indent * 20}px`, paddingRight: '16px' }}
      onClick={onToggle}
    >
      <span className="w-3.5 flex-shrink-0 text-[#94A3B8] group-hover:text-[#64748B]">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </span>
      <span className="flex-1 text-sm font-medium text-[#0F172A] truncate">
        {label}
        {puc && <span className="ml-2 text-[11px] text-[#94A3B8] font-mono font-normal">{puc}</span>}
      </span>
      <span className={`text-sm flex-shrink-0 ${amtCls(amount)}`}>{fmt(amount)}</span>
    </div>
  )
}

function LeafRow({ label, puc, amount, indent = 1, muted = false }: {
  label: string; puc?: string; amount: number; indent?: number; muted?: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 py-1 hover:bg-[#F8FAFC]"
      style={{ paddingLeft: `${12 + indent * 20}px`, paddingRight: '16px' }}
    >
      <span className="w-3.5 flex-shrink-0" />
      <span className={`flex-1 text-sm truncate ${muted ? 'text-[#64748B]' : 'text-[#0F172A]'}`}>
        {label}
        {puc && <span className="ml-2 text-[11px] text-[#94A3B8] font-mono">{puc}</span>}
      </span>
      <span className={`text-sm flex-shrink-0 ${amtCls(amount)}`}>{fmt(amount)}</span>
    </div>
  )
}

function TxItem({ label, amount, indent = 3 }: { label: string; amount: number; indent?: number }) {
  return (
    <div
      className="flex items-center gap-2 py-0.5 hover:bg-[#F8FAFC]"
      style={{ paddingLeft: `${12 + indent * 20}px`, paddingRight: '16px' }}
    >
      <span className="w-3.5 flex-shrink-0" />
      <span className="flex-1 text-xs text-[#64748B] truncate">{label}</span>
      <span className={`text-xs flex-shrink-0 ${amtCls(amount)}`}>{fmt(amount)}</span>
    </div>
  )
}

function TotalRow({ label, amount, highlight = false }: {
  label: string; amount: number; highlight?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 py-2 px-4 border-t border-[#E2E8F0] ${highlight ? 'bg-[#F1F5F9]' : 'bg-[#F8FAFC]'}`}>
      <span className={`flex-1 text-sm font-semibold ${highlight ? 'text-[#0F172A]' : 'text-[#374151]'}`}>{label}</span>
      <span className={`text-sm font-bold flex-shrink-0 ${amtCls(amount, true)}`}>{fmt(amount)}</span>
    </div>
  )
}

function ResultRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center gap-2 py-2.5 px-4 bg-[#0F172A] mt-0.5">
      <span className="flex-1 text-sm font-bold text-white">{label}</span>
      <span className={`text-sm font-bold flex-shrink-0 ${amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
        {fmt(amount)}
      </span>
    </div>
  )
}

// ── Types for grouped data ────────────────────────────────────────────────────

type GroupedTx = { puc: string; name: string; total: number; items: { label: string; amount: number }[] }
type GroupedClient = { name: string; nit: string | null; total: number; invs: RawInvoice[] }
type GroupedPlate = { plate: string; total: number; byPuc: { puc: string; name: string; total: number }[] }

// ── Main component ────────────────────────────────────────────────────────────

export default function EstadoResultadosClient({
  year, availableYears,
  invoices, anticipos, legExps, tolls,
  personalCosts, generalCosts, financialExps, financialIncs,
  taxes, personalOwner, anticiposNoLeg,
}: PYLData) {
  const router = useRouter()

  const [activeMonths, setActiveMonths] = useState<number[]>([1,2,3,4,5,6,7,8,9,10,11,12])
  const [viewMode, setViewMode]         = useState<'detailed' | 'comparative'>('detailed')
  const [expanded, setExpanded]         = useState<Set<string>>(
    new Set(['inc', 'cos', 'gop', 'fin', 'imp', 'own', 'mem'])
  )
  const [exporting, setExporting]       = useState(false)

  const isAllMonths = activeMonths.length === 12

  const toggle = useCallback((k: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }, [])

  const isOpen = (k: string) => expanded.has(k)

  const toggleMonth = (m: number) => {
    setActiveMonths(prev => {
      if (prev.length === 12) return [m]
      const next = prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => a - b)
      return next.length === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : next
    })
  }

  // ── Aggregation helpers ───────────────────────────────────────────────────

  const filterM = useCallback(<T extends { month: number }>(data: T[]): T[] => {
    return isAllMonths ? data : data.filter(d => activeMonths.includes(d.month))
  }, [activeMonths, isAllMonths])

  const sumM = useCallback(<T extends { month: number; amount: number }>(data: T[]): number => {
    return filterM(data).reduce((s, d) => s + d.amount, 0)
  }, [filterM])

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalFact   = useMemo(() => sumM(invoices),      [sumM, invoices])
  const totalAnt    = useMemo(() => sumM(anticipos),     [sumM, anticipos])
  const totalInc    = totalFact + totalAnt

  const totalLeg    = useMemo(() => sumM(legExps),       [sumM, legExps])
  const totalTolls  = useMemo(() => sumM(tolls),         [sumM, tolls])
  const totalCostos = totalLeg + totalTolls

  const totalPers   = useMemo(() => sumM(personalCosts), [sumM, personalCosts])
  const totalGen    = useMemo(() => sumM(generalCosts),  [sumM, generalCosts])
  const totalGastOp = totalPers + totalGen

  const totalFinInc = useMemo(() => sumM(financialIncs), [sumM, financialIncs])
  const totalFinExp = useMemo(() => sumM(financialExps), [sumM, financialExps])
  const netoFin     = totalFinInc - totalFinExp

  const totalImp    = useMemo(() => sumM(taxes),         [sumM, taxes])
  const totalOwner  = useMemo(() => sumM(personalOwner), [sumM, personalOwner])
  const totalNoLeg  = useMemo(() => sumM(anticiposNoLeg),[sumM, anticiposNoLeg])

  const utilBruta = totalInc - totalCostos
  const utilOp    = utilBruta - totalGastOp
  const utilNeta  = utilOp + netoFin - totalImp

  // ── Grouped data ──────────────────────────────────────────────────────────

  const invByClient = useMemo<GroupedClient[]>(() => {
    const map = new Map<string, GroupedClient>()
    for (const inv of filterM(invoices)) {
      const key = inv.clientNit ?? inv.clientName
      if (!map.has(key)) map.set(key, { name: inv.clientName, nit: inv.clientNit, invs: [], total: 0 })
      const c = map.get(key)!
      c.invs.push(inv)
      c.total += inv.amount
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filterM, invoices])

  const antByDesc = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of filterM(anticipos)) {
      const k = a.description ?? 'Sin descripción'
      map.set(k, (map.get(k) ?? 0) + a.amount)
    }
    return Array.from(map.entries()).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total)
  }, [filterM, anticipos])

  const legByPlate = useMemo<GroupedPlate[]>(() => {
    const pm = new Map<string, Map<string, number>>()
    for (const e of filterM(legExps)) {
      const plate = e.plate ?? 'Sin asignación'
      const puc   = expToPuc(e.expenseType)
      if (!pm.has(plate)) pm.set(plate, new Map())
      const pp = pm.get(plate)!
      pp.set(puc, (pp.get(puc) ?? 0) + e.amount)
    }
    return Array.from(pm.entries())
      .map(([plate, pucMap]) => ({
        plate,
        total: Array.from(pucMap.values()).reduce((s, v) => s + v, 0),
        byPuc: Array.from(pucMap.entries())
          .map(([puc, total]) => ({ puc, name: pucName(puc), total }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total)
  }, [filterM, legExps])

  const tollByPlate = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of filterM(tolls)) {
      const k = t.plate ?? 'Sin placa'
      map.set(k, (map.get(k) ?? 0) + t.amount)
    }
    return Array.from(map.entries()).map(([plate, total]) => ({ plate, total })).sort((a, b) => b.total - a.total)
  }, [filterM, tolls])

  const groupTx = useCallback((data: RawTx[]): GroupedTx[] => {
    const map = new Map<string, { total: number; items: { label: string; amount: number }[] }>()
    for (const tx of filterM(data)) {
      if (!map.has(tx.pucCode)) map.set(tx.pucCode, { total: 0, items: [] })
      const g = map.get(tx.pucCode)!
      g.total += tx.amount
      g.items.push({ label: tx.description ?? '—', amount: tx.amount })
    }
    return Array.from(map.entries())
      .map(([puc, v]) => ({ puc, name: pucName(puc), total: v.total, items: v.items }))
      .sort((a, b) => b.total - a.total)
  }, [filterM])

  const persGrouped   = useMemo(() => groupTx(personalCosts),  [groupTx, personalCosts])
  const genGrouped    = useMemo(() => groupTx(generalCosts),   [groupTx, generalCosts])
  const finExpGrouped = useMemo(() => groupTx(financialExps),  [groupTx, financialExps])
  const finIncGrouped = useMemo(() => groupTx(financialIncs),  [groupTx, financialIncs])
  const taxGrouped    = useMemo(() => groupTx(taxes),          [groupTx, taxes])
  const ownGrouped    = useMemo(() => groupTx(personalOwner),  [groupTx, personalOwner])
  const noLegGrouped  = useMemo(() => groupTx(anticiposNoLeg), [groupTx, anticiposNoLeg])

  // ── Comparative rows ──────────────────────────────────────────────────────

  const compRows = useMemo(() => {
    function ms(data: { month: number; amount: number }[], m: number) {
      return data.filter(d => d.month === m).reduce((s, d) => s + d.amount, 0)
    }
    return activeMonths.map(m => {
      const fact  = ms(invoices, m)
      const ant   = ms(anticipos, m)
      const inc   = fact + ant
      const leg   = ms(legExps, m)
      const tls   = ms(tolls, m)
      const cos   = leg + tls
      const uB    = inc - cos
      const pers  = ms(personalCosts, m)
      const gen   = ms(generalCosts, m)
      const gop   = pers + gen
      const uOp   = uB - gop
      const finI  = ms(financialIncs, m)
      const finE  = ms(financialExps, m)
      const imp   = ms(taxes, m)
      const uNeta = uOp + (finI - finE) - imp
      return { m, fact, ant, inc, leg, tls, cos, uB, pers, gen, gop, uOp, finI, finE, nFin: finI - finE, imp, uNeta }
    })
  }, [invoices, anticipos, legExps, tolls, personalCosts, generalCosts, financialExps, financialIncs, taxes, activeMonths])

  // ── Excel export ──────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const rows: (string | number)[][] = [
        ['ISADAN TRANSPORTES S.A.S'],
        ['NIT: 902030120-8'],
        [`Estado de Resultados ${year}`],
        [],
        ['CONCEPTO', 'TOTAL'],
        [],
        ['INGRESOS'],
        ['  Ingresos Facturados (41450510)', totalFact],
        ...invByClient.map(c => [`    ${c.name}${c.nit ? ' — NIT ' + c.nit : ''}`, c.total]),
        ['  Anticipos — No Facturados (28050510)', totalAnt],
        ...antByDesc.map(a => [`    ${a.label}`, a.total]),
        ['TOTAL INGRESOS', totalInc],
        [],
        ['COSTOS OPERACIONALES'],
        ['  Costos por Vehículo y Operación', totalLeg],
        ...legByPlate.flatMap(p => [
          [`    ${p.plate}`, p.total],
          ...p.byPuc.map(x => [`      ${x.puc} ${x.name}`, x.total]),
        ]),
        ['  Peajes Flypass (61450575)', totalTolls],
        ...tollByPlate.map(t => [`    ${t.plate}`, t.total]),
        ['TOTAL COSTOS OPERACIONALES', totalCostos],
        [],
        ['UTILIDAD BRUTA', utilBruta],
        [],
        ['GASTOS OPERACIONALES'],
        ['  Costos de Personal', totalPers],
        ...persGrouped.map(g => [`    ${g.puc} ${g.name}`, g.total]),
        ['  Gastos Generales y Administrativos', totalGen],
        ...genGrouped.map(g => [`    ${g.puc} ${g.name}`, g.total]),
        ['TOTAL GASTOS OPERACIONALES', totalGastOp],
        [],
        ['UTILIDAD OPERACIONAL', utilOp],
        [],
        ['INGRESOS / GASTOS FINANCIEROS'],
        ['  Ingresos Financieros (42100510)', totalFinInc],
        ...finIncGrouped.map(g => [`    ${g.puc} ${g.name}`, g.total]),
        ['  Gastos Financieros', totalFinExp],
        ...finExpGrouped.map(g => [`    ${g.puc} ${g.name}`, g.total]),
        ['  NETO FINANCIERO', netoFin],
        [],
        ['IMPUESTOS'],
        ...taxGrouped.map(g => [`  ${g.puc} ${g.name}`, g.total]),
        ['TOTAL IMPUESTOS', totalImp],
        [],
        ['UTILIDAD NETA', utilNeta],
        [],
        ['GASTOS PERSONALES PROPIETARIO (fuera del resultado empresarial)', totalOwner],
        ...ownGrouped.map(g => [`  ${g.puc} ${g.name}`, g.total]),
        [],
        ['MEMO — ANTICIPOS NO LEGALIZADOS', totalNoLeg],
        ...noLegGrouped.map(g => [`  ${g.puc} ${g.name}`, g.total]),
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 65 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Estado de Resultados')
      XLSX.writeFile(wb, `estado-resultados-${year}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  // ── Detailed view ─────────────────────────────────────────────────────────

  const renderDetailed = () => (
    <div className="divide-y divide-[#F1F5F9]">

      {/* INGRESOS */}
      <SectionRow open={isOpen('inc')} onToggle={() => toggle('inc')} label="INGRESOS" amount={totalInc} indent={0} />
      {isOpen('inc') && <>
        <SectionRow open={isOpen('inc_fact')} onToggle={() => toggle('inc_fact')} label="Ingresos Facturados" puc="41450510" amount={totalFact} indent={1} />
        {isOpen('inc_fact') && invByClient.map(c => {
          const cid = `inc_c_${c.nit ?? c.name}`
          return (
            <div key={cid}>
              <SectionRow open={isOpen(cid)} onToggle={() => toggle(cid)} label={c.name} puc={c.nit ? `NIT ${c.nit}` : undefined} amount={c.total} indent={2} />
              {isOpen(cid) && c.invs.map(inv => (
                <TxItem key={inv.invoiceNumber ?? String(inv.amount)} label={inv.invoiceNumber ?? '(sin número)'} amount={inv.amount} indent={3} />
              ))}
            </div>
          )
        })}

        <SectionRow open={isOpen('inc_ant')} onToggle={() => toggle('inc_ant')} label="Anticipos — No Facturados" puc="28050510" amount={totalAnt} indent={1} />
        {isOpen('inc_ant') && antByDesc.map(a => (
          <LeafRow key={a.label} label={a.label} amount={a.total} indent={2} />
        ))}
      </>}

      <TotalRow label="TOTAL INGRESOS" amount={totalInc} />

      {/* COSTOS OPERACIONALES */}
      <SectionRow open={isOpen('cos')} onToggle={() => toggle('cos')} label="COSTOS OPERACIONALES" amount={totalCostos} indent={0} />
      {isOpen('cos') && <>
        <SectionRow open={isOpen('cos_veh')} onToggle={() => toggle('cos_veh')} label="Costos por Vehículo y Operación" amount={totalLeg} indent={1} />
        {isOpen('cos_veh') && legByPlate.map(p => {
          const pid = `cos_veh_${p.plate}`
          return (
            <div key={pid}>
              <SectionRow open={isOpen(pid)} onToggle={() => toggle(pid)} label={p.plate} amount={p.total} indent={2} />
              {isOpen(pid) && p.byPuc.map(x => (
                <LeafRow key={x.puc} label={x.name} puc={x.puc} amount={x.total} indent={3} />
              ))}
            </div>
          )
        })}

        <SectionRow open={isOpen('cos_fly')} onToggle={() => toggle('cos_fly')} label="Peajes Flypass" puc="61450575" amount={totalTolls} indent={1} />
        {isOpen('cos_fly') && tollByPlate.map(t => (
          <LeafRow key={t.plate} label={t.plate} amount={t.total} indent={2} />
        ))}
      </>}

      <TotalRow label="TOTAL COSTOS OPERACIONALES" amount={totalCostos} />
      <TotalRow label="UTILIDAD BRUTA" amount={utilBruta} highlight />

      {/* GASTOS OPERACIONALES */}
      <SectionRow open={isOpen('gop')} onToggle={() => toggle('gop')} label="GASTOS OPERACIONALES" amount={totalGastOp} indent={0} />
      {isOpen('gop') && <>
        <SectionRow open={isOpen('gop_per')} onToggle={() => toggle('gop_per')} label="Costos de Personal" amount={totalPers} indent={1} />
        {isOpen('gop_per') && persGrouped.map(g => {
          const gid = `gop_per_${g.puc}`
          return (
            <div key={gid}>
              <SectionRow open={isOpen(gid)} onToggle={() => toggle(gid)} label={g.name} puc={g.puc} amount={g.total} indent={2} />
              {isOpen(gid) && g.items.map((item, i) => (
                <TxItem key={i} label={item.label} amount={item.amount} indent={3} />
              ))}
            </div>
          )
        })}

        <SectionRow open={isOpen('gop_gen')} onToggle={() => toggle('gop_gen')} label="Gastos Generales y Administrativos" amount={totalGen} indent={1} />
        {isOpen('gop_gen') && genGrouped.map(g => {
          const gid = `gop_gen_${g.puc}`
          return (
            <div key={gid}>
              <SectionRow open={isOpen(gid)} onToggle={() => toggle(gid)} label={g.name} puc={g.puc} amount={g.total} indent={2} />
              {isOpen(gid) && g.items.map((item, i) => (
                <TxItem key={i} label={item.label} amount={item.amount} indent={3} />
              ))}
            </div>
          )
        })}
      </>}

      <TotalRow label="TOTAL GASTOS OPERACIONALES" amount={totalGastOp} />
      <ResultRow label="UTILIDAD OPERACIONAL" amount={utilOp} />

      {/* FINANCIEROS */}
      <SectionRow open={isOpen('fin')} onToggle={() => toggle('fin')} label="INGRESOS / GASTOS FINANCIEROS" amount={netoFin} indent={0} />
      {isOpen('fin') && <>
        <SectionRow open={isOpen('fin_inc')} onToggle={() => toggle('fin_inc')} label="Ingresos Financieros" puc="42100510" amount={totalFinInc} indent={1} />
        {isOpen('fin_inc') && finIncGrouped.map(g => (
          <LeafRow key={g.puc} label={g.name} puc={g.puc} amount={g.total} indent={2} />
        ))}

        <SectionRow open={isOpen('fin_exp')} onToggle={() => toggle('fin_exp')} label="Gastos Financieros" amount={totalFinExp} indent={1} />
        {isOpen('fin_exp') && finExpGrouped.map(g => {
          const gid = `fin_exp_${g.puc}`
          return (
            <div key={gid}>
              <SectionRow open={isOpen(gid)} onToggle={() => toggle(gid)} label={g.name} puc={g.puc} amount={g.total} indent={2} />
              {isOpen(gid) && g.items.map((item, i) => (
                <TxItem key={i} label={item.label} amount={item.amount} indent={3} />
              ))}
            </div>
          )
        })}
      </>}
      <TotalRow label="NETO FINANCIERO" amount={netoFin} />

      {/* IMPUESTOS */}
      <SectionRow open={isOpen('imp')} onToggle={() => toggle('imp')} label="IMPUESTOS" amount={totalImp} indent={0} />
      {isOpen('imp') && taxGrouped.map(g => {
        const gid = `imp_${g.puc}`
        return (
          <div key={gid}>
            <SectionRow open={isOpen(gid)} onToggle={() => toggle(gid)} label={g.name} puc={g.puc} amount={g.total} indent={1} />
            {isOpen(gid) && g.items.map((item, i) => (
              <TxItem key={i} label={item.label} amount={item.amount} indent={2} />
            ))}
          </div>
        )
      })}

      <ResultRow label="UTILIDAD NETA" amount={utilNeta} />

      {/* GASTOS PERSONALES (below the line) */}
      <div className="border-t-4 border-double border-[#E2E8F0]">
        <SectionRow open={isOpen('own')} onToggle={() => toggle('own')} label="GASTOS PERSONALES PROPIETARIO (fuera del resultado)" amount={totalOwner} indent={0} />
        {isOpen('own') && ownGrouped.map(g => {
          const gid = `own_${g.puc}`
          return (
            <div key={gid}>
              <SectionRow open={isOpen(gid)} onToggle={() => toggle(gid)} label={g.name} puc={g.puc} amount={g.total} indent={1} />
              {isOpen(gid) && g.items.map((item, i) => (
                <TxItem key={i} label={item.label} amount={item.amount} indent={2} />
              ))}
            </div>
          )
        })}
      </div>

      {/* MEMO */}
      {totalNoLeg > 0 && (
        <div className="border-t-2 border-dashed border-[#E2E8F0]">
          <SectionRow open={isOpen('mem')} onToggle={() => toggle('mem')} label="MEMO — ANTICIPOS NO LEGALIZADOS" puc="13301510" amount={totalNoLeg} indent={0} />
          {isOpen('mem') && noLegGrouped.map(g => (
            <LeafRow key={g.puc} label={g.name} puc={g.puc} amount={g.total} indent={1} />
          ))}
        </div>
      )}
    </div>
  )

  // ── Comparative view ──────────────────────────────────────────────────────

  type CompLine = { label: string; key: string; bold?: boolean; highlight?: boolean; result?: boolean }

  const compLines: CompLine[] = [
    { label: 'Ingresos Facturados (41450510)', key: 'fact' },
    { label: 'Anticipos No Facturados (28050510)', key: 'ant' },
    { label: 'TOTAL INGRESOS', key: 'inc', bold: true },
    { label: 'Costos por Vehículo', key: 'leg' },
    { label: 'Peajes Flypass (61450575)', key: 'tls' },
    { label: 'TOTAL COSTOS', key: 'cos', bold: true },
    { label: 'UTILIDAD BRUTA', key: 'uB', bold: true, highlight: true },
    { label: 'Costos de Personal', key: 'pers' },
    { label: 'Gastos Generales', key: 'gen' },
    { label: 'TOTAL GASTOS OPERACIONALES', key: 'gop', bold: true },
    { label: 'UTILIDAD OPERACIONAL', key: 'uOp', bold: true, highlight: true },
    { label: 'Ingresos Financieros', key: 'finI' },
    { label: 'Gastos Financieros', key: 'finE' },
    { label: 'Neto Financiero', key: 'nFin', bold: true },
    { label: 'Impuestos', key: 'imp' },
    { label: 'UTILIDAD NETA', key: 'uNeta', result: true },
  ]

  const compTotals: Record<string, number> = {
    fact: totalFact, ant: totalAnt, inc: totalInc,
    leg: totalLeg, tls: totalTolls, cos: totalCostos,
    uB: utilBruta, pers: totalPers, gen: totalGen, gop: totalGastOp,
    uOp: utilOp, finI: totalFinInc, finE: totalFinExp, nFin: netoFin,
    imp: totalImp, uNeta: utilNeta,
  }

  const renderComparative = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[500px]">
        <thead>
          <tr className="bg-[#F8FAFC]">
            <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide border-b border-[#E2E8F0] min-w-[200px]">
              Concepto
            </th>
            {activeMonths.map(m => (
              <th key={m} className="text-right py-2.5 px-3 font-semibold text-[#374151] text-xs uppercase tracking-wide border-b border-[#E2E8F0] min-w-[110px]">
                {MESES_CORTOS[m - 1]}
              </th>
            ))}
            <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide border-b border-[#E2E8F0] min-w-[120px]">
              {isAllMonths ? 'Total año' : 'Total'}
            </th>
          </tr>
        </thead>
        <tbody>
          {compLines.map((row, i) => {
            const total = compTotals[row.key] ?? 0
            const isResult = row.result
            const isBold   = row.bold || row.result
            return (
              <tr
                key={i}
                className={`border-b border-[#F1F5F9] ${
                  isResult   ? 'bg-[#0F172A]' :
                  row.highlight ? 'bg-[#F1F5F9]' :
                  'hover:bg-[#F8FAFC]'
                }`}
              >
                <td className={`py-2 px-4 text-sm ${isBold ? 'font-semibold' : ''} ${isResult ? 'text-white' : 'text-[#0F172A]'}`}>
                  {row.label}
                </td>
                {compRows.map(cr => {
                  const val = (cr as Record<string, number>)[row.key] ?? 0
                  return (
                    <td key={cr.m} className={`py-2 px-3 text-right text-sm tabular-nums ${
                      isResult
                        ? val < 0 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'
                        : `${isBold ? 'font-semibold' : ''} ${val < 0 ? 'text-red-600' : val > 0 ? 'text-[#0F172A]' : 'text-[#CBD5E1]'}`
                    }`}>
                      {fmtAbs(val)}
                    </td>
                  )
                })}
                <td className={`py-2 px-4 text-right text-sm tabular-nums font-semibold ${
                  isResult
                    ? total < 0 ? 'text-red-400' : 'text-green-400'
                    : total < 0 ? 'text-red-600' : total > 0 ? 'text-[#0F172A]' : 'text-[#CBD5E1]'
                }`}>
                  {fmtAbs(total)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Estado de Resultados</h1>
          <p className="text-xs text-[#64748B] mt-0.5">ISADAN Transportes S.A.S — NIT 902030120-8</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={e => router.push(`/reportes?año=${e.target.value}`)}
            className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden bg-white">
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'detailed' ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              Detallada
            </button>
            <button
              onClick={() => setViewMode('comparative')}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-[#E2E8F0] ${
                viewMode === 'comparative' ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              Comparativa
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? 'Exportando…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <button
          onClick={() => setActiveMonths([1,2,3,4,5,6,7,8,9,10,11,12])}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isAllMonths ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#374151] hover:bg-[#E2E8F0]'
          }`}
        >
          Año completo
        </button>
        {MESES_CORTOS.map((label, i) => {
          const mn     = i + 1
          const active = activeMonths.includes(mn) && !isAllMonths
          return (
            <button
              key={mn}
              onClick={() => toggleMonth(mn)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#2563EB] text-white'
                  : isAllMonths
                  ? 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0] hover:text-[#374151]'
                  : 'bg-[#F1F5F9] text-[#374151] hover:bg-[#E2E8F0]'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Ingresos',  value: totalInc,    color: 'text-[#0F172A]' },
          { label: 'Total Costos',    value: totalCostos, color: 'text-[#0F172A]' },
          { label: 'Utilidad Bruta',  value: utilBruta,   color: utilBruta  >= 0 ? 'text-green-700' : 'text-red-600' },
          { label: 'Utilidad Neta',   value: utilNeta,    color: utilNeta   >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4">
            <p className={`text-base md:text-lg font-bold ${color} tabular-nums`}>{fmt(value)}</p>
            <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center">
          <span className="text-xs text-[#64748B]">
            {isAllMonths
              ? `Enero — Diciembre ${year}`
              : activeMonths.length === 1
              ? `${MESES_CORTOS[activeMonths[0] - 1]} ${year}`
              : `${activeMonths.length} meses · ${year}`
            }
          </span>
          {viewMode === 'detailed' && (
            <button
              onClick={() => setExpanded(new Set(['inc','cos','gop','fin','imp','own','mem']))}
              className="ml-auto text-xs text-[#64748B] hover:text-[#0F172A] transition-colors"
            >
              Contraer todo
            </button>
          )}
        </div>

        {viewMode === 'detailed' ? renderDetailed() : renderComparative()}
      </div>

    </div>
  )
}
