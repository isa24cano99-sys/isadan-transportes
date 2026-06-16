'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { crearLegalizacionAction } from './actions'
import { formatCOP } from '@/lib/utils'

interface Trip {
  id: string
  trip_number: string
  origin: string
  destination: string
  load_date: string
  freight_value: number
  advance_amount: number
  driver_id: string | null
  clients: { name: string } | null
  vehicles: { plate: string } | null
  drivers: { full_name: string } | null
}

interface Props {
  trips: Trip[]
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

export default function NuevaLegalizacionForm({ trips }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [tripId, setTripId] = useState('')
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [tripDate, setTripDate] = useState('')
  const [tonnage, setTonnage] = useState('')
  const [content, setContent] = useState('')
  const [freight, setFreight] = useState('')
  const [advance, setAdvance] = useState('')
  const [percentage, setPercentage] = useState('0')
  const [expenses, setExpenses] = useState<Expenses>({})
  const [otrosDesc, setOtrosDesc] = useState('')

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

  const setExp = (key: string, val: string) =>
    setExpenses(prev => ({ ...prev, [key]: val }))

  const gastosViaje = EXPENSE_FIELDS.reduce((s, f) => s + num(expenses[f.key] ?? ''), 0)
  const porcentajeCalc = num(freight) * (num(percentage) / 100)
  const advanceNum = num(advance)
  const balanceAnticipo = advanceNum - gastosViaje   // >0 sobró, <0 faltó
  const sobrante = balanceAnticipo > 0 ? balanceAnticipo : 0
  const faltante = balanceAnticipo < 0 ? -balanceAnticipo : 0
  const saldoFinal = porcentajeCalc - balanceAnticipo // >0 empresa debe, <0 conductor debe

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!tripId) { setError('Selecciona un viaje'); return }
    setLoading(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    const result = await crearLegalizacionAction(fd)
    if (result.ok) {
      router.push('/legalizaciones')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al guardar')
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const readonlyCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#64748B] bg-[#F8FAFC] outline-none'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="driver_id" value={selectedTrip?.driver_id ?? ''} />

      {/* ENCABEZADO */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Información del viaje</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className={labelCls}>Viaje *</label>
            <select
              name="trip_id"
              value={tripId}
              onChange={e => handleTripChange(e.target.value)}
              required
              className={`${inputCls} bg-white`}
            >
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
            <input
              name="trip_date"
              type="date"
              value={tripDate}
              onChange={e => setTripDate(e.target.value)}
              required
              className={inputCls}
            />
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
            <label className={labelCls}>Tonelaje</label>
            <input
              name="tonnage"
              type="number"
              min="0"
              step="0.01"
              value={tonnage}
              onChange={e => setTonnage(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Contenido (carga)</label>
            <input
              name="content"
              type="text"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Ej: cemento, arena, café..."
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Flete (COP)</label>
            <input
              name="freight"
              type="number"
              min="0"
              value={freight}
              onChange={e => setFreight(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Anticipo (COP)</label>
            <input
              name="advance"
              type="number"
              min="0"
              value={advance}
              onChange={e => setAdvance(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
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
              <input
                name={`exp_${key}`}
                type="number"
                min="0"
                value={expenses[key] ?? ''}
                onChange={e => setExp(key, e.target.value)}
                placeholder="0"
                className={inputCls}
              />
              {key === 'otros' && (
                <input
                  name="exp_otros_desc"
                  type="text"
                  value={otrosDesc}
                  onChange={e => setOtrosDesc(e.target.value)}
                  placeholder="Descripción..."
                  className={`${inputCls} mt-1.5`}
                />
              )}
            </div>
          ))}

          <div>
            <label className={labelCls}>Porcentaje ganancia conductor (%)</label>
            <input
              name="percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={percentage}
              onChange={e => setPercentage(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* TOTALES */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Liquidación</h2>
        <div className="space-y-2">

          {/* Bloque 1: Balance del anticipo */}
          <Row label="Anticipo entregado" value={formatCOP(advanceNum)} />
          <Row label="(-) Gastos del viaje" value={formatCOP(gastosViaje)} />
          <div className="border-t border-[#E2E8F0] pt-2.5 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">(=) Balance anticipo</span>
              <span className={`text-sm font-bold ${balanceAnticipo > 0 ? 'text-green-700' : balanceAnticipo < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                {formatCOP(Math.abs(balanceAnticipo))}{' '}
                {balanceAnticipo > 0 ? 'sobrante' : balanceAnticipo < 0 ? 'faltante' : ''}
              </span>
            </div>
          </div>

          {/* Bloque 2: Pago al conductor */}
          <div className="pt-3 mt-1 border-t border-[#E2E8F0] space-y-2">
            <Row label={`Porcentaje conductor (${num(percentage)}% del flete)`} value={formatCOP(porcentajeCalc)} />
            {sobrante > 0 && <Row label="(-) Sobrante anticipo" value={formatCOP(sobrante)} />}
            {faltante > 0 && <Row label="(+) Faltante anticipo" value={formatCOP(faltante)} />}
          </div>

          {/* Resultado final */}
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
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Guardando...' : 'Guardar legalización'}
        </button>
      </div>
    </form>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-semibold text-[#0F172A]' : 'text-[#64748B]'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-[#0F172A]' : 'text-[#0F172A]'}`}>{value}</span>
    </div>
  )
}
