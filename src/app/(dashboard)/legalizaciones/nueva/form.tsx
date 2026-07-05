'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { crearLegalizacionAction, actualizarLegalizacionAction } from './actions'
import { formatCOP } from '@/lib/utils'
import { X } from 'lucide-react'

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
  weight_kg: number | null
  price_per_ton: number | null
  clients: { name: string } | null
  vehicles: { plate: string } | null
  drivers: { full_name: string } | null
}

export interface LegalizacionInitialData {
  id: string
  trip_id: string
  trip_date: string
  freight: number
  advance: number
  percentage: number
  expenses: Record<string, string>
  otrosDesc: string
}

interface Props {
  trips: Trip[]
  initialData?: LegalizacionInitialData
}

const EXPENSE_FIELDS: { key: string; label: string }[] = [
  { key: 'acpm_contado',     label: 'ACPM contado' },
  { key: 'cargue',           label: 'Cargue' },
  { key: 'descargue',        label: 'Descargue' },
  { key: 'peajes',           label: 'Peajes' },
  { key: 'comision_empresa', label: 'Comisión empresa' },
  { key: 'llantas',          label: 'Llantas' },
  { key: 'engrase',          label: 'Engrase' },
  { key: 'lavada',           label: 'Lavada' },
  { key: 'parqueos',         label: 'Parqueos' },
  { key: 'carrozada',        label: 'Carrozada' },
  { key: 'descarrozada',     label: 'Descarrozada' },
  { key: 'cambio_aceite',    label: 'Cambio aceite' },
  { key: 'varada',           label: 'Varada' },
  { key: 'otros',            label: 'Otros' },
]

type Expenses = Record<string, string>

function num(v: string) { return parseFloat(v) || 0 }

export default function NuevaLegalizacionForm({ trips, initialData }: Props) {
  const router = useRouter()
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [showPreview,  setShowPreview]  = useState(false)

  const isEdit = !!initialData

  const initTrip = initialData ? trips.find(t => t.id === initialData.trip_id) ?? null : null

  const [tripId,       setTripId]       = useState(initialData?.trip_id ?? '')
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(initTrip)
  const [tripDate,     setTripDate]     = useState(initialData?.trip_date ?? '')
  const [tonnage,      setTonnage]      = useState('')
  const [content,      setContent]      = useState('')
  const [freight,      setFreight]      = useState(initialData ? String(initialData.freight) : '')
  const [advance,      setAdvance]      = useState(initialData ? String(initialData.advance) : '')
  const [percentage,   setPercentage]   = useState(initialData ? String(initialData.percentage) : '0')
  const [expenses,     setExpenses]     = useState<Expenses>(initialData?.expenses ?? {})
  const [otrosDesc,    setOtrosDesc]    = useState(initialData?.otrosDesc ?? '')

  const handleTripChange = useCallback((id: string) => {
    setTripId(id)
    const trip = trips.find(t => t.id === id) ?? null
    setSelectedTrip(trip)
    if (trip) {
      setTripDate(trip.load_date)
      setFreight(String(trip.freight_value))
      setAdvance(String(trip.advance_amount ?? 0))
    } else {
      setTripDate('')
      setFreight('')
      setAdvance('')
    }
  }, [trips])

  const setExp = (key: string, val: string) => setExpenses(prev => ({ ...prev, [key]: val }))

  const gastosViaje      = EXPENSE_FIELDS.reduce((s, f) => s + num(expenses[f.key] ?? ''), 0)
  const porcentajeCalc   = num(freight) * (num(percentage) / 100)
  const advanceNum       = num(advance)
  const balanceAnticipo  = advanceNum - gastosViaje
  const sobrante         = balanceAnticipo > 0 ? balanceAnticipo : 0
  const faltante         = balanceAnticipo < 0 ? -balanceAnticipo : 0
  const saldoFinal       = porcentajeCalc - balanceAnticipo

  function buildFormData() {
    const fd = new FormData()
    fd.set('trip_id',      tripId)
    fd.set('driver_id',    selectedTrip?.driver_id ?? '')
    fd.set('trip_date',    tripDate)
    fd.set('freight',      freight)
    fd.set('advance',      advance)
    fd.set('percentage',   percentage)
    EXPENSE_FIELDS.forEach(({ key }) => fd.set(`exp_${key}`, expenses[key] ?? '0'))
    fd.set('exp_otros_desc', otrosDesc)
    return fd
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!tripId) { setError('Selecciona un viaje'); return }
    setError('')
    setShowPreview(true)
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    const fd = buildFormData()
    const result = isEdit
      ? await actualizarLegalizacionAction(initialData!.id, fd)
      : await crearLegalizacionAction(fd)
    if (result.ok) {
      router.push('/legalizaciones')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al guardar')
      setShowPreview(false)
      setLoading(false)
    }
  }

  const inputCls    = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const readonlyCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#64748B] bg-[#F8FAFC] outline-none'
  const labelCls    = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="driver_id" value={selectedTrip?.driver_id ?? ''} />

      {/* ENCABEZADO */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Información del viaje</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className={labelCls}>Viaje *</label>
            <select name="trip_id" value={tripId} onChange={e => handleTripChange(e.target.value)} required
              className={`${inputCls} bg-white`}>
              <option value="">Seleccionar viaje</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>
                  {t.trip_number} — {t.origin} → {t.destination}
                </option>
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

          {/* Datos del manifiesto y carga (autocomplete desde el viaje) */}
          <div>
            <label className={labelCls}>Número de manifiesto</label>
            <input readOnly value={selectedTrip?.manifest_number ?? ''} placeholder="—" className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Peso del viaje (kg)</label>
            <input readOnly value={selectedTrip?.weight_kg != null ? String(selectedTrip.weight_kg) : ''} placeholder="—" className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Precio por tonelada (COP)</label>
            <input readOnly value={selectedTrip?.price_per_ton != null ? String(selectedTrip.price_per_ton) : ''} placeholder="—" className={readonlyCls} />
          </div>
          <div>
            <label className={labelCls}>Tonelaje legalización</label>
            <input name="tonnage" type="number" min="0" step="0.01" value={tonnage} onChange={e => setTonnage(e.target.value)} placeholder="0" className={inputCls} />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>Contenido (carga)</label>
            <input name="content" type="text" value={content} onChange={e => setContent(e.target.value)} placeholder="Ej: cemento, arena, café..." className={inputCls} />
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

      {/* GASTOS */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Gastos del viaje</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {EXPENSE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input name={`exp_${key}`} type="number" min="0" value={expenses[key] ?? ''} onChange={e => setExp(key, e.target.value)} placeholder="0" className={inputCls} />
              {key === 'otros' && (
                <input name="exp_otros_desc" type="text" value={otrosDesc} onChange={e => setOtrosDesc(e.target.value)} placeholder="Descripción..." className={`${inputCls} mt-1.5`} />
              )}
            </div>
          ))}
          <div>
            <label className={labelCls}>Porcentaje ganancia conductor (%)</label>
            <input name="percentage" type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => setPercentage(e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>
      </div>

      {/* TOTALES */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Liquidación</h2>
        <div className="space-y-2">
          <Row label="Anticipo entregado" value={formatCOP(advanceNum)} />
          <Row label="(-) Gastos del viaje" value={formatCOP(gastosViaje)} />
          <div className="border-t border-[#E2E8F0] pt-2.5 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">(=) Balance anticipo</span>
              <span className={`text-sm font-bold ${balanceAnticipo > 0 ? 'text-green-700' : balanceAnticipo < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                {formatCOP(Math.abs(balanceAnticipo))} {balanceAnticipo > 0 ? 'sobrante' : balanceAnticipo < 0 ? 'faltante' : ''}
              </span>
            </div>
          </div>
          <div className="pt-3 mt-1 border-t border-[#E2E8F0] space-y-2">
            <Row label={`Porcentaje conductor (${num(percentage)}% del flete)`} value={formatCOP(porcentajeCalc)} />
            {sobrante > 0 && <Row label="(-) Sobrante anticipo" value={formatCOP(sobrante)} />}
            {faltante > 0 && <Row label="(+) Faltante anticipo" value={formatCOP(faltante)} />}
          </div>
          <div className="border-t border-[#E2E8F0] pt-2.5">
            <div className="flex items-start justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">(=) Saldo a pagar al conductor</span>
              <div className="text-right">
                <span className={`text-base font-bold ${saldoFinal > 0 ? 'text-green-700' : saldoFinal < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                  {saldoFinal < 0 ? '-' : ''}{formatCOP(Math.abs(saldoFinal))}
                </span>
                <p className={`text-xs mt-0.5 ${saldoFinal > 0 ? 'text-green-700' : saldoFinal < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                  {saldoFinal > 0 ? 'Empresa le debe al conductor' : saldoFinal < 0 ? 'Conductor le debe a la empresa' : 'Cuadrado'}
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

    {/* Modal de preview */}
    {showPreview && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <h2 className="font-semibold text-[#0F172A]">Vista previa — Legalización</h2>
            <button onClick={() => setShowPreview(false)}><X size={18} className="text-[#64748B]" /></button>
          </div>

          <div className="p-6 space-y-4 text-sm">
            <Section title="Viaje">
              <PreviewRow label="# Viaje" value={selectedTrip?.trip_number ?? '—'} />
              <PreviewRow label="Ruta" value={selectedTrip ? `${selectedTrip.origin} → ${selectedTrip.destination}` : '—'} />
              <PreviewRow label="Conductor" value={selectedTrip?.drivers?.full_name ?? '—'} />
              <PreviewRow label="Placa" value={selectedTrip?.vehicles?.plate ?? '—'} />
              <PreviewRow label="Cliente" value={selectedTrip?.clients?.name ?? '—'} />
              <PreviewRow label="Fecha" value={tripDate} />
              {selectedTrip?.manifest_number && <PreviewRow label="Manifiesto" value={selectedTrip.manifest_number} />}
            </Section>

            <Section title="Financiero">
              <PreviewRow label="Flete" value={formatCOP(num(freight))} />
              <PreviewRow label="Anticipo" value={formatCOP(num(advance))} />
              <PreviewRow label="Total gastos" value={formatCOP(gastosViaje)} />
              <PreviewRow label="Balance anticipo" value={`${formatCOP(Math.abs(balanceAnticipo))} ${balanceAnticipo >= 0 ? 'sobrante' : 'faltante'}`} />
              <PreviewRow label={`Porcentaje conductor (${percentage}%)`} value={formatCOP(porcentajeCalc)} />
              <div className="border-t border-[#E2E8F0] pt-2 mt-2 flex justify-between font-semibold">
                <span className="text-[#0F172A]">Saldo al conductor</span>
                <span className={saldoFinal >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {saldoFinal < 0 ? '-' : ''}{formatCOP(Math.abs(saldoFinal))}
                </span>
              </div>
            </Section>

            {(gastosViaje > 0 || porcentajeCalc > 0) && (
              <Section title="Detalle de gastos">
                {EXPENSE_FIELDS.filter(f => num(expenses[f.key] ?? '') > 0).map(f => (
                  <PreviewRow key={f.key} label={f.label} value={formatCOP(num(expenses[f.key] ?? ''))} />
                ))}
                {porcentajeCalc > 0 && (
                  <PreviewRow label={`Porcentaje conductor (${percentage}%)`} value={formatCOP(porcentajeCalc)} />
                )}
              </Section>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-6 py-4 flex gap-3 rounded-b-2xl">
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
      <span className="text-[#64748B]">{label}</span>
      <span className="text-[#0F172A] font-medium">{value}</span>
    </div>
  )
}
