'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { crearLegalizacionAction, actualizarLegalizacionAction, crearCuentaYCategoriaAction } from './actions'
import { formatCOP, formatTripOption, tripMatchesQuery, tripManifiesto } from '@/lib/utils'
import { FIXED_FIELDS } from '@/lib/legalizacion-fields'
import { type FEClasificada, FE_LINEA_CUENTA } from '@/lib/fe-lineas'
import { X, Plus, Trash2 } from 'lucide-react'

type TransactionCategory = {
  id: string
  name: string
  puc_code: string | null
  type: 'NEGOCIO' | 'CASA'
  active: boolean
}

interface Trip {
  id: string
  trip_number: string
  origin: string
  destination: string
  load_date: string
  freight_value: number
  advance_amount: number
  driver_id: string | null
  manifest_number: string | null
  manifest_auth: string | null
  weight_kg: number | null
  price_per_ton: number | null
  clients: { name: string } | null
  vehicles: { plate: string } | null
  drivers: { full_name: string } | null
}

export type DynExpenseInit = {
  pucCode: string
  categoryName: string
  description: string
  amount: number
}

export interface LegalizacionInitialData {
  id: string
  trip_id: string
  trip_date: string
  freight: number
  advance: number
  percentage: number
  comision: number
  fixedExpenses: Record<string, number>   // solo tipos SIN FE (los demás fijos)
  dynExpenses: DynExpenseInit[]
  // líneas de gasto con FE (acpm/cargue/descargue), una por fila con su propio enlace
  feLines?: { tipo: string; amount: number; matchedInvoiceId: string | null }[]
}

interface Props {
  trips: Trip[]
  initialData?: LegalizacionInitialData
  categories: TransactionCategory[]
  feClasificadas: FEClasificada[]
}

type DynRow = { _id: string; categoryId: string; description: string; amount: string }
// Línea de gasto con FE (acpm/cargue/descargue): monto + su propia FE enlazada.
type FeLine = { _id: string; tipo: string; amount: string; matchedInvoiceId: string }
const FE_KEYS = Object.keys(FE_LINEA_CUENTA)                      // acpm_contado, cargue, descargue
const FE_FIELDS = FIXED_FIELDS.filter(f => f.key in FE_LINEA_CUENTA)
const NON_FE_FIELDS = FIXED_FIELDS.filter(f => !(f.key in FE_LINEA_CUENTA))

let _rc = 0
function mkId() { return `r${++_rc}` }
function num(v: string) { return parseFloat(v) || 0 }

export default function NuevaLegalizacionForm({ trips, initialData, categories, feClasificadas }: Props) {
  const router = useRouter()
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const isEdit  = !!initialData
  const initTrip = initialData ? trips.find(t => t.id === initialData.trip_id) ?? null : null

  const [tripId,      setTripId]      = useState(initialData?.trip_id ?? '')
  const [tripSearch,  setTripSearch]  = useState('')
  const [selectedTrip,setSelectedTrip]= useState<Trip | null>(initTrip)
  const [tripDate,    setTripDate]    = useState(initialData?.trip_date ?? '')
  const [freight,     setFreight]     = useState(initialData ? String(initialData.freight) : '')
  const [advance,     setAdvance]     = useState(initialData ? String(initialData.advance) : '')
  // Default 10%. En edición, muestra el valor guardado si existe (> 0); si no, 10.
  const [percentage,  setPercentage]  = useState(
    initialData && initialData.percentage > 0 ? String(initialData.percentage) : '10',
  )
  // Comisión empresa: opcional, no todos los viajes la tienen (default vacío)
  const [comision,    setComision]    = useState(
    initialData && initialData.comision > 0 ? String(initialData.comision) : '',
  )
  const [weightKg,    setWeightKg]    = useState(initTrip?.weight_kg     != null ? String(initTrip.weight_kg)     : '')
  const [pricePerTon, setPricePerTon] = useState(initTrip?.price_per_ton != null ? String(initTrip.price_per_ton) : '')

  // opciones de FE para una línea de un tipo: FE del mes cuyo tercero está clasificado en
  // la cuenta de ese tipo (combustible/cargue/descargue). Selección 100% manual.
  const feOptionsDe = (tipo: string) => {
    const cuenta = FE_LINEA_CUENTA[tipo]
    const mes = (tripDate ?? '').slice(0, 7)               // 'YYYY-MM'
    if (!cuenta || !mes) return [] as FEClasificada[]
    return feClasificadas.filter(fe => fe.cuenta === cuenta && (fe.issue_date ?? '').slice(0, 7) === mes)
  }
  // ¿esta FE ya está enlazada a OTRA legalización distinta a la que se edita? (la propia no cuenta)
  const currentLegId = initialData?.id ?? null
  const asignadaAOtra = (fe: FEClasificada) => !!fe.asignadaLegalizacionId && fe.asignadaLegalizacionId !== currentLegId

  // ── Líneas de gasto CON FE (acpm/cargue/descargue): repetibles, cada una su monto y su
  //    propia FE — un viaje puede tener 2 tanqueadas, cada una con su factura real. ────────
  const [feLines, setFeLines] = useState<FeLine[]>(() => {
    const loaded = (initialData?.feLines ?? []).map(l => ({ _id: mkId(), tipo: l.tipo, amount: String(l.amount), matchedInvoiceId: l.matchedInvoiceId ?? '' }))
    const out: FeLine[] = []
    for (const k of FE_KEYS) {                              // ≥1 línea por tipo (para el input base)
      const del = loaded.filter(l => l.tipo === k)
      out.push(...(del.length ? del : [{ _id: mkId(), tipo: k, amount: '', matchedInvoiceId: '' }]))
    }
    return out
  })
  const addFeLine    = (tipo: string) => setFeLines(prev => [...prev, { _id: mkId(), tipo, amount: '', matchedInvoiceId: '' }])
  const updateFeLine = (id: string, patch: Partial<FeLine>) => setFeLines(prev => prev.map(l => l._id === id ? { ...l, ...patch } : l))
  const removeFeLine = (id: string) => setFeLines(prev => prev.filter(l => l._id !== id))

  // ── Gastos fijos SIN FE (lavada, parqueos, etc.): un input por tipo, se suman ─────────────
  const [fixed, setFixed] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of NON_FE_FIELDS) {
      const v = initialData?.fixedExpenses?.[f.key]
      init[f.key] = v != null && v > 0 ? String(v) : ''
    }
    return init
  })
  const setFixedAmount = (key: string, val: string) => setFixed(prev => ({ ...prev, [key]: val }))

  // ── Dynamic expense rows ────────────────────────────────────────────────────
  const [localCats, setLocalCats] = useState<TransactionCategory[]>(categories)

  const defaultCatId = useMemo(
    () => localCats.find(c => c.puc_code === '61450585')?.id ?? localCats.find(c => c.type === 'NEGOCIO' && c.active)?.id ?? '',
    [localCats],
  )

  const [dynExpenses, setDynExpenses] = useState<DynRow[]>(() => {
    if (!initialData?.dynExpenses?.length) return []
    return initialData.dynExpenses.map(d => ({
      _id: mkId(),
      categoryId: categories.find(c => c.puc_code === d.pucCode || c.name === d.categoryName)?.id
                  ?? categories.find(c => c.puc_code === '61450585')?.id
                  ?? categories[0]?.id ?? '',
      description: d.description,
      amount: String(d.amount),
    }))
  })

  const addRow = useCallback(() => {
    setDynExpenses(prev => [...prev, { _id: mkId(), categoryId: defaultCatId, description: '', amount: '' }])
  }, [defaultCatId])

  const updateRow = useCallback((id: string, patch: Partial<DynRow>) => {
    setDynExpenses(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r))
  }, [])

  const removeRow = useCallback((id: string) => {
    setDynExpenses(prev => prev.filter(r => r._id !== id))
  }, [])

  // ── Nueva cuenta PUC modal ──────────────────────────────────────────────────
  const [showNewAcc,  setShowNewAcc]  = useState(false)
  const [newAccName,  setNewAccName]  = useState('')
  const [newAccCode,  setNewAccCode]  = useState('6145')
  const [newAccError, setNewAccError] = useState('')
  const [savingAcc,   setSavingAcc]   = useState(false)

  const handleCreateAccount = async () => {
    if (!newAccName.trim() || !newAccCode.trim()) return
    setSavingAcc(true)
    setNewAccError('')
    const res = await crearCuentaYCategoriaAction({ nombre: newAccName.trim(), codigo: newAccCode.trim() })
    if (!res.ok || !res.category) {
      setNewAccError(res.error ?? 'Error al crear la cuenta')
      setSavingAcc(false)
      return
    }
    const newCat: TransactionCategory = {
      id: res.category.id, name: res.category.name,
      puc_code: res.category.puc_code, type: 'NEGOCIO', active: true,
    }
    setLocalCats(prev => [...prev, newCat])
    setDynExpenses(prev => [...prev, { _id: mkId(), categoryId: newCat.id, description: '', amount: '' }])
    setShowNewAcc(false)
    setNewAccName('')
    setNewAccCode('6145')
    setSavingAcc(false)
  }

  // ── Trip selection ──────────────────────────────────────────────────────────
  const handleTripChange = useCallback((id: string) => {
    setTripId(id)
    const trip = trips.find(t => t.id === id) ?? null
    setSelectedTrip(trip)
    if (trip) {
      setTripDate(trip.load_date)
      setFreight(String(trip.freight_value))
      setAdvance(String(trip.advance_amount ?? 0))
      setWeightKg(trip.weight_kg     != null ? String(trip.weight_kg)     : '')
      setPricePerTon(trip.price_per_ton != null ? String(trip.price_per_ton) : '')
    } else {
      setTripDate(''); setFreight(''); setAdvance(''); setWeightKg(''); setPricePerTon('')
    }
  }, [trips])

  // ── Calculated totals ───────────────────────────────────────────────────────
  const gastosFijos       = NON_FE_FIELDS.reduce((s, f) => s + num(fixed[f.key]), 0)
                          + feLines.reduce((s, l) => s + num(l.amount), 0)
  const gastosAdicionales = dynExpenses.reduce((s, r) => s + num(r.amount), 0)
  const gastosViaje       = gastosFijos + gastosAdicionales               // sin porcentaje ni comisión
  const porcentajeCalc    = num(freight) * (num(percentage) / 100)
  const comisionNum       = num(comision)
  const totalGastos       = gastosViaje + porcentajeCalc + comisionNum
  const advanceNum        = num(advance)
  const subtotal          = advanceNum - gastosViaje                      // anticipo − gastos del viaje
  const balance           = subtotal - porcentajeCalc - comisionNum       // >0 conductor debe · <0 empresa debe

  // ── Form data builder ───────────────────────────────────────────────────────
  function buildFormData() {
    const fd = new FormData()
    fd.set('trip_id',       tripId)
    fd.set('driver_id',     selectedTrip?.driver_id ?? '')
    fd.set('trip_date',     tripDate)
    fd.set('freight',       freight)
    fd.set('advance',       advance)
    fd.set('percentage',    percentage)
    fd.set('comision_empresa', comision)
    fd.set('weight_kg',     weightKg)
    fd.set('price_per_ton', pricePerTon)
    // gastos fijos SIN FE: {key: monto}
    fd.set('fixed_expenses', JSON.stringify(
      Object.fromEntries(NON_FE_FIELDS.map(f => [f.key, num(fixed[f.key])]).filter(([, v]) => (v as number) > 0)),
    ))
    // líneas con FE (acpm/cargue/descargue): una por fila, con su monto y su enlace
    fd.set('fe_lines', JSON.stringify(
      feLines.filter(l => num(l.amount) > 0)
        .map(l => ({ tipo: l.tipo, amount: num(l.amount), matched_invoice_id: l.matchedInvoiceId || null })),
    ))
    fd.set('dynamic_expenses', JSON.stringify(
      dynExpenses.filter(r => num(r.amount) > 0).map(r => {
        const cat = localCats.find(c => c.id === r.categoryId)
        return { pucCode: cat?.puc_code ?? '', categoryName: cat?.name ?? 'otros', description: r.description, amount: num(r.amount) }
      }),
    ))
    return fd
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!tripId) { setError('Selecciona un viaje'); return }
    setError('')
    setShowPreview(true)
  }

  const handleConfirm = async () => {
    // Aviso (no bloqueo): si alguna FE seleccionada ya está asignada a OTRA legalización.
    const conflictos = feLines.map(l => l.matchedInvoiceId).filter(Boolean)
      .map(id => feClasificadas.find(fe => fe.id === id))
      .filter((fe): fe is FEClasificada => !!fe && asignadaAOtra(fe))
    if (conflictos.length) {
      const refs = [...new Set(conflictos.map(fe => fe.asignadaRef))].join(', ')
      if (!window.confirm(`Una o más facturas ya están asignadas a otra legalización (${refs}). ¿Seguro que quieres reasignarlas aquí?`)) return
    }
    setLoading(true)
    setError('')
    const fd  = buildFormData()
    const res = isEdit ? await actualizarLegalizacionAction(initialData!.id, fd) : await crearLegalizacionAction(fd)
    if (res.ok) { router.push('/legalizaciones'); router.refresh() }
    else { setError(res.error ?? 'Error al guardar'); setShowPreview(false); setLoading(false) }
  }

  const inputCls    = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const readonlyCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#64748B] bg-[#F8FAFC] outline-none'
  const labelCls    = 'block text-xs font-semibold text-[#64748B] mb-1.5'
  // Dropdown de "otros gastos" acotado a costos operativos del viaje (6145xx): un gasto
  // puntual de un viaje no puede ser nómina/prestaciones/anticipos/ingresos/pasivos. Las
  // categorías excluidas siguen existiendo y siendo válidas en bancos/cartera/causaciones;
  // solo se ocultan de ESTE dropdown. El guard de aprobar_legalizacion (clase 5/6) es el
  // backstop si un dato con otra cuenta entra por otra vía (import directo, legacy, remapeo).
  const negocioCats = localCats.filter(c => c.active && c.type === 'NEGOCIO' && (c.puc_code ?? '').startsWith('6145'))

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="driver_id" value={selectedTrip?.driver_id ?? ''} />

      {/* ── INFORMACIÓN DEL VIAJE ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Información del viaje</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Viaje *</label>
            <input
              type="text"
              value={tripSearch}
              onChange={e => setTripSearch(e.target.value)}
              placeholder="Buscar por manifiesto, placa o ruta…"
              className={`${inputCls} mb-2`}
            />
            <select name="trip_id" value={tripId} onChange={e => handleTripChange(e.target.value)} required
              className={`${inputCls} bg-white`}>
              <option value="">Seleccionar viaje</option>
              {trips.filter(t => tripMatchesQuery(t, tripSearch)).map(t => (
                <option key={t.id} value={t.id}>{formatTripOption(t)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Placa</label>
            <input readOnly value={selectedTrip?.vehicles?.plate ?? ''} className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Fecha del viaje *</label>
            <input name="trip_date" type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} required className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Conductor</label>
            <input readOnly value={selectedTrip?.drivers?.full_name ?? ''} className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Empresa / Cliente</label>
            <input readOnly value={selectedTrip?.clients?.name ?? ''} className={readonlyCls} />
          </div>

          <div>
            <label className={labelCls}>Origen</label>
            <input readOnly value={selectedTrip?.origin ?? ''} className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Destino</label>
            <input readOnly value={selectedTrip?.destination ?? ''} className={readonlyCls} />
          </div>

          <div>
            <label className={labelCls}>Número de manifiesto</label>
            <input readOnly value={selectedTrip?.manifest_number ?? ''} placeholder="—" className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Peso del viaje (kg)</label>
            <input name="weight_kg" type="number" min="0" step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Precio por tonelada (COP)</label>
            <input name="price_per_ton" type="number" min="0" step="0.01" value={pricePerTon} onChange={e => setPricePerTon(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Flete (COP)</label>
            <input name="freight" type="number" min="0" value={freight} onChange={e => setFreight(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Anticipo (COP)</label>
            <input name="advance" type="number" min="0" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>
      </div>

      {/* ── GASTOS FIJOS ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Gastos del viaje</h2>
        {/* Gastos fijos SIN FE (un input por tipo) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          {NON_FE_FIELDS.map(f => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={fixed[f.key] ?? ''}
                onChange={e => setFixedAmount(f.key, e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          ))}
        </div>

        {/* Líneas con FE (acpm/cargue/descargue): repetibles, cada una su monto + su factura */}
        <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-4">
          {FE_FIELDS.map(f => {
            const lines = feLines.filter(l => l.tipo === f.key)
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls}>{f.label}</label>
                  <button type="button" onClick={() => addFeLine(f.key)}
                    className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium inline-flex items-center gap-1">
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {lines.map(line => (
                    <div key={line._id} className="grid grid-cols-[120px_1fr_28px] gap-2 items-center">
                      <input type="number" min="0" inputMode="numeric" value={line.amount}
                        onChange={e => updateFeLine(line._id, { amount: e.target.value })}
                        placeholder="Monto" className={inputCls} />
                      <select value={line.matchedInvoiceId}
                        onChange={e => updateFeLine(line._id, { matchedInvoiceId: e.target.value })}
                        className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-2.5 text-xs bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                        <option value="">FE del mes (opcional)…</option>
                        {feOptionsDe(f.key).map(fe => (
                          <option key={fe.id} value={fe.id}>
                            {fe.name_issuer} · {fe.issue_date} · {formatCOP(fe.total)}
                            {asignadaAOtra(fe) ? ` — ⚠ ya asignada a ${fe.asignadaRef}` : ''}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeFeLine(line._id)}
                        className="text-[#CBD5E1] hover:text-red-500 transition-colors p-1" title="Quitar línea">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-[#94A3B8]">
            Cada línea se enlaza a su propia factura (proveedor real + placa). Sin FE → Consumidor Final.
            Agrega varias del mismo tipo si el viaje tuvo, p.ej., dos tanqueadas con dos facturas.
          </p>
        </div>
        <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Subtotal gastos fijos</span>
          <span className="text-sm font-bold text-[#0F172A] tabular-nums">{formatCOP(gastosFijos)}</span>
        </div>
      </div>

      {/* ── GASTOS ADICIONALES ────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-[#0F172A]">Gastos adicionales</h2>
          <button type="button"
            onClick={() => { setShowNewAcc(true); setNewAccError('') }}
            className="text-xs text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 transition-colors">
            + Nueva cuenta
          </button>
        </div>
        <p className="text-xs text-[#94A3B8] mb-4">Gastos que no encajan en los campos fijos. Cada uno con su categoría PUC.</p>

        {/* Column headers */}
        {dynExpenses.length > 0 && (
          <div className="hidden sm:grid sm:grid-cols-[1fr_150px_110px_28px] gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Categoría</span>
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Descripción</span>
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider text-right">Monto (COP)</span>
            <span />
          </div>
        )}

        <div className="space-y-2">
          {dynExpenses.map(row => (
            <div key={row._id} className="flex flex-col sm:grid sm:grid-cols-[1fr_150px_110px_28px] gap-2 items-start sm:items-center bg-[#F8FAFC] sm:bg-transparent border border-[#E2E8F0] sm:border-0 rounded-lg sm:rounded-none p-2 sm:p-0">
              <select value={row.categoryId} onChange={e => updateRow(row._id, { categoryId: e.target.value })}
                className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[#0F172A]">
                {negocioCats.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.puc_code ? ` · ${c.puc_code}` : ''}</option>
                ))}
              </select>
              <input type="text" value={row.description} onChange={e => updateRow(row._id, { description: e.target.value })}
                placeholder="Descripción opcional..."
                className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              <input type="number" min="0" value={row.amount} onChange={e => updateRow(row._id, { amount: e.target.value })}
                placeholder="0"
                className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-right" />
              <button type="button" onClick={() => removeRow(row._id)}
                className="self-end sm:self-auto text-[#CBD5E1] hover:text-red-500 transition-colors p-1">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow}
          className="mt-3 flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors">
          <Plus size={13} /> Agregar gasto
        </button>

        {/* Porcentaje conductor + comisión empresa */}
        <div className="mt-5 pt-5 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Porcentaje ganancia conductor (%)</label>
            <input name="percentage" type="number" min="0" max="100" step="0.01"
              value={percentage} onChange={e => setPercentage(e.target.value)} placeholder="10" className={inputCls} />
            {num(freight) > 0 && num(percentage) > 0 && (
              <p className="text-xs text-[#64748B] mt-1">
                = {formatCOP(porcentajeCalc)} ({percentage}% de {formatCOP(num(freight))})
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Comisión empresa (COP)</label>
            <input name="comision_empresa" type="number" min="0" step="0.01"
              value={comision} onChange={e => setComision(e.target.value)} placeholder="0 (opcional)" className={inputCls} />
            <p className="text-xs text-[#94A3B8] mt-1">Opcional. Se contabiliza contra Consumidor Final.</p>
          </div>
        </div>
      </div>

      {/* ── LIQUIDACIÓN ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Liquidación</h2>
        <div className="space-y-2">
          {/* Paso 1: anticipo − gastos del viaje = subtotal */}
          <Row label="Anticipo entregado" value={formatCOP(advanceNum)} />
          <div className="pl-3 space-y-1 border-l-2 border-[#F1F5F9]">
            <Row label="Gastos fijos"       value={formatCOP(gastosFijos)} />
            <Row label="Gastos adicionales" value={formatCOP(gastosAdicionales)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#64748B]">(−) Gastos del viaje</span>
            <span className="text-sm text-[#0F172A] tabular-nums">{formatCOP(gastosViaje)}</span>
          </div>
          <div className="border-t border-[#E2E8F0] pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">(=) Subtotal</span>
              <span className="text-sm font-bold text-[#0F172A] tabular-nums">{formatCOP(subtotal)}</span>
            </div>
          </div>

          {/* Paso 2: subtotal − porcentaje conductor − comisión = balance */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-[#64748B]">(−) Porcentaje conductor ({num(percentage)}%)</span>
            <span className="text-sm text-[#0F172A] tabular-nums">{formatCOP(porcentajeCalc)}</span>
          </div>
          {comisionNum > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B]">(−) Comisión empresa</span>
              <span className="text-sm text-[#0F172A] tabular-nums">{formatCOP(comisionNum)}</span>
            </div>
          )}
          <div className="border-t border-[#E2E8F0] pt-2.5">
            <div className="flex items-start justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">(=) Balance</span>
              <div className="text-right">
                <span className={`text-base font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                  {formatCOP(Math.abs(balance))}
                </span>
                <p className={`text-xs mt-0.5 ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                  {balance > 0 ? 'Conductor debe a la empresa' : balance < 0 ? 'Empresa le debe al conductor' : 'Cuadrado'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
          Cancelar
        </button>
        <button type="submit"
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {isEdit ? 'Vista previa y guardar' : 'Vista previa'}
        </button>
      </div>
    </form>

    {/* ── Modal de preview ────────────────────────────────────────────────── */}
    {showPreview && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0">
            <h2 className="font-semibold text-[#0F172A]">Vista previa — Legalización</h2>
            <button onClick={() => setShowPreview(false)}><X size={18} className="text-[#64748B]" /></button>
          </div>
          <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1">
            <Section title="Viaje">
              <PreviewRow label="Manifiesto" value={tripManifiesto(selectedTrip)} />
              <PreviewRow label="Ruta"       value={selectedTrip ? `${selectedTrip.origin} → ${selectedTrip.destination}` : '—'} />
              <PreviewRow label="Conductor"  value={selectedTrip?.drivers?.full_name ?? '—'} />
              <PreviewRow label="Placa"      value={selectedTrip?.vehicles?.plate ?? '—'} />
              <PreviewRow label="Cliente"    value={selectedTrip?.clients?.name ?? '—'} />
              <PreviewRow label="Fecha"      value={tripDate} />
              {selectedTrip?.manifest_number && <PreviewRow label="Manifiesto" value={selectedTrip.manifest_number} />}
            </Section>

            <Section title="Financiero">
              <PreviewRow label="Flete"              value={formatCOP(num(freight))} />
              <PreviewRow label="Anticipo"           value={formatCOP(num(advance))} />
              <PreviewRow label="Gastos fijos"       value={formatCOP(gastosFijos)} />
              <PreviewRow label="Gastos adicionales" value={formatCOP(gastosAdicionales)} />
              <PreviewRow label={`Porcentaje conductor (${percentage}%)`} value={formatCOP(porcentajeCalc)} />
              {comisionNum > 0 && <PreviewRow label="Comisión empresa" value={formatCOP(comisionNum)} />}
              <PreviewRow label="(−) Total gastos"   value={formatCOP(totalGastos)} />
              <div className="border-t border-[#E2E8F0] pt-2 mt-2 flex justify-between font-semibold">
                <span className="text-[#0F172A]">Balance</span>
                <span className={balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-700' : 'text-[#64748B]'}>
                  {formatCOP(Math.abs(balance))} {balance > 0 ? '(cond. debe)' : balance < 0 ? '(emp. debe)' : ''}
                </span>
              </div>
            </Section>

            {totalGastos > 0 && (
              <Section title="Detalle de gastos">
                {NON_FE_FIELDS.filter(f => num(fixed[f.key]) > 0).map(f => (
                  <PreviewRow key={f.key} label={f.label} value={formatCOP(num(fixed[f.key]))} />
                ))}
                {feLines.filter(l => num(l.amount) > 0).map(l => {
                  const f = FE_FIELDS.find(x => x.key === l.tipo)
                  const fe = l.matchedInvoiceId ? feClasificadas.find(x => x.id === l.matchedInvoiceId) : null
                  const label = (f?.label ?? l.tipo) + (fe ? ` · FE ${fe.name_issuer}` : ' · sin FE')
                  return <PreviewRow key={l._id} label={label} value={formatCOP(num(l.amount))} />
                })}
                {dynExpenses.filter(r => num(r.amount) > 0).map(r => {
                  const cat   = localCats.find(c => c.id === r.categoryId)
                  const label = (cat?.name ?? 'Gasto') + (r.description ? ` · ${r.description}` : '')
                  return <PreviewRow key={r._id} label={label} value={formatCOP(num(r.amount))} />
                })}
                {porcentajeCalc > 0 && (
                  <PreviewRow label={`Porcentaje conductor (${percentage}%)`} value={formatCOP(porcentajeCalc)} />
                )}
                {comisionNum > 0 && (
                  <PreviewRow label="Comisión empresa" value={formatCOP(comisionNum)} />
                )}
              </Section>
            )}
          </div>
          <div className="border-t border-[#E2E8F0] px-6 py-4 flex gap-3 rounded-b-2xl flex-shrink-0 bg-white">
            <button onClick={() => setShowPreview(false)}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
              Editar
            </button>
            <button onClick={handleConfirm} disabled={loading}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
              {loading ? 'Guardando...' : 'Confirmar y guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal Nueva cuenta PUC ───────────────────────────────────────────── */}
    {showNewAcc && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[#0F172A]">Nueva cuenta PUC</h3>
            <button type="button" onClick={() => setShowNewAcc(false)}>
              <X size={16} className="text-[#64748B]" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nombre del gasto</label>
              <input value={newAccName} onChange={e => setNewAccName(e.target.value)}
                placeholder="Ej: Mantenimiento preventivo" className={inputCls}
                onKeyDown={e => e.key === 'Enter' && handleCreateAccount()} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Código PUC</label>
              <input value={newAccCode} onChange={e => setNewAccCode(e.target.value)}
                placeholder="61450585" className={inputCls} />
              <p className="text-xs text-[#94A3B8] mt-1">Base sugerida: 6145 (Costos operacionales transporte)</p>
            </div>
            <div>
              <label className={labelCls}>Tipo contable</label>
              <input readOnly value="COSTO_OPERACIONAL" className={readonlyCls} />
            </div>
          </div>
          {newAccError && <p className="text-xs text-red-500">{newAccError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setShowNewAcc(false); setNewAccError('') }}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] text-xs font-medium py-2 rounded-lg hover:bg-[#F8FAFC]">
              Cancelar
            </button>
            <button type="button" onClick={handleCreateAccount}
              disabled={!newAccName.trim() || !newAccCode.trim() || savingAcc}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg">
              {savingAcc ? 'Guardando...' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#64748B]">{label}</span>
      <span className="text-sm text-[#0F172A]">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">{title}</p>
      <div className="bg-[#F8FAFC] rounded-lg p-3 space-y-1.5">{children}</div>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#64748B] truncate mr-4">{label}</span>
      <span className="text-[#0F172A] font-medium flex-shrink-0">{value}</span>
    </div>
  )
}
