'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearViajeAction, editarViajeAction } from './actions'

const COLOMBIA_GEO: Record<string, string[]> = {
  'Amazonas':             ['Leticia'],
  'Antioquia':            ['Apartadó', 'Bello', 'Caucasia', 'Chigorodó', 'Envigado', 'Itagüí', 'Medellín', 'Rionegro', 'Sabaneta', 'Turbo'],
  'Arauca':               ['Arauca', 'Saravena', 'Tame'],
  'Atlántico':            ['Baranoa', 'Barranquilla', 'Malambo', 'Sabanagrande', 'Soledad'],
  'Bolívar':              ['Cartagena', 'El Carmen de Bolívar', 'Magangué', 'Mompox'],
  'Boyacá':               ['Chiquinquirá', 'Duitama', 'Puerto Boyacá', 'Sogamoso', 'Tunja'],
  'Caldas':               ['Chinchiná', 'La Dorada', 'Manizales', 'Riosucio'],
  'Caquetá':              ['Florencia', 'San Vicente del Caguán'],
  'Casanare':             ['Aguazul', 'Tauramena', 'Villanueva', 'Yopal'],
  'Cauca':                ['Patía', 'Popayán', 'Puerto Tejada', 'Santander de Quilichao'],
  'Cesar':                ['Aguachica', 'Bosconia', 'Codazzi', 'Valledupar'],
  'Chocó':                ['Istmina', 'Quibdó', 'Tadó'],
  'Córdoba':              ['Cereté', 'Lorica', 'Montelíbano', 'Montería', 'Sahagún'],
  'Cundinamarca':         ['Bogotá', 'Chía', 'Facatativá', 'Fusagasugá', 'Girardot', 'Madrid', 'Mosquera', 'Soacha', 'Zipaquirá'],
  'Guainía':              ['Inírida'],
  'Guaviare':             ['San José del Guaviare'],
  'Huila':                ['Garzón', 'La Plata', 'Neiva', 'Pitalito'],
  'La Guajira':           ['Maicao', 'Manaure', 'Riohacha', 'Uribia'],
  'Magdalena':            ['Ciénaga', 'El Banco', 'Fundación', 'Santa Marta'],
  'Meta':                 ['Acacías', 'Granada', 'Puerto López', 'Villavicencio'],
  'Nariño':               ['Ipiales', 'Pasto', 'Tumaco', 'Túquerres'],
  'Norte de Santander':   ['Cúcuta', 'Ocaña', 'Pamplona', 'Villa del Rosario'],
  'Putumayo':             ['Mocoa', 'Orito', 'Puerto Asís', 'Sibundoy'],
  'Quindío':              ['Armenia', 'Calarcá', 'Montenegro', 'Quimbaya'],
  'Risaralda':            ['Dosquebradas', 'La Virginia', 'Pereira', 'Santa Rosa de Cabal'],
  'San Andrés':           ['San Andrés'],
  'Santander':            ['Barrancabermeja', 'Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Socorro'],
  'Sucre':                ['Corozal', 'Sampués', 'San Marcos', 'Sincelejo'],
  'Tolima':               ['Espinal', 'Honda', 'Ibagué', 'Líbano', 'Melgar'],
  'Valle del Cauca':      ['Buga', 'Buenaventura', 'Cali', 'Cartago', 'Jamundí', 'Palmira', 'Tuluá'],
  'Vaupés':               ['Mitú'],
  'Vichada':              ['Puerto Carreño'],
}

const DEPTS = Object.keys(COLOMBIA_GEO).sort()

const SEL = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]'
const INP = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

export interface TripData {
  id: string
  manifest_auth: string | null
  manifest_number: string | null
  tercero_id: string | null
  vehicle_id: string
  driver_id: string
  origin: string
  destination: string
  load_date: string
  freight_value: number
  advance_amount: number
  weight_kg: number | null
  price_per_ton: number | null
  load_content: string | null
  notes: string | null
}

interface Props {
  terceros: { id: string; nombre: string }[]
  vehicles: { id: string; plate: string; brand: string; model: string }[]
  drivers: { id: string; full_name: string }[]
  trip?: TripData
}

function parseLocation(raw: string): { dept: string; city: string } {
  const rawTrimmed = raw.trim()
  const idx = rawTrimmed.lastIndexOf(', ')
  if (idx !== -1) {
    const city = rawTrimmed.slice(0, idx)
    const dept = rawTrimmed.slice(idx + 2)
    const deptKey = Object.keys(COLOMBIA_GEO).find(k => k.toLowerCase() === dept.toLowerCase())
    if (deptKey) {
      const cityKey = COLOMBIA_GEO[deptKey].find(c => c.toLowerCase() === city.toLowerCase())
      return { dept: deptKey, city: cityKey ?? city }
    }
  }
  for (const [dept, cities] of Object.entries(COLOMBIA_GEO)) {
    const cityKey = cities.find(c => c.toLowerCase() === rawTrimmed.toLowerCase())
    if (cityKey) return { dept, city: cityKey }
  }
  return { dept: '', city: rawTrimmed }
}

function calcFreight(kg: string, ppt: string): number | null {
  const w = parseFloat(kg)
  const p = parseFloat(ppt)
  if (w > 0 && p > 0) return Math.round((w / 1000) * p)
  return null
}

export default function ViajeForm({ terceros, vehicles, drivers, trip }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!trip
  const isManifest = !!trip?.manifest_auth

  const initOrigin = trip ? parseLocation(trip.origin) : { dept: '', city: '' }
  const initDest   = trip ? parseLocation(trip.destination) : { dept: '', city: '' }

  const [originDept, setOriginDept] = useState(initOrigin.dept)
  const [originCity, setOriginCity] = useState(initOrigin.city)
  const [destDept,   setDestDept]   = useState(initDest.dept)
  const [destCity,   setDestCity]   = useState(initDest.city)

  const [originText, setOriginText] = useState(trip?.origin ?? '')
  const [destText,   setDestText]   = useState(trip?.destination ?? '')

  const [weightKg,    setWeightKg]    = useState(trip?.weight_kg?.toString() ?? '')
  const [pricePerTon, setPricePerTon] = useState(trip?.price_per_ton?.toString() ?? '')
  const [freight,     setFreight]     = useState(trip?.freight_value?.toString() ?? '')

  const previewFreight = calcFreight(weightKg, pricePerTon)

  const handleWeightChange = (v: string) => {
    setWeightKg(v)
    const c = calcFreight(v, pricePerTon)
    if (c !== null) setFreight(String(c))
  }
  const handlePriceChange = (v: string) => {
    setPricePerTon(v)
    const c = calcFreight(weightKg, v)
    if (c !== null) setFreight(String(c))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isManifest) {
      if (!originText.trim()) { setError('El origen es obligatorio'); return }
      if (!destText.trim())   { setError('El destino es obligatorio'); return }
    } else {
      if (!originDept || !originCity) { setError('Selecciona departamento y ciudad de origen'); return }
      if (!destDept   || !destCity)   { setError('Selecciona departamento y ciudad de destino'); return }
    }
    if (!freight || Number(freight) <= 0) { setError('El valor del flete es obligatorio'); return }

    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    if (isManifest) {
      formData.set('origin',      originText.trim())
      formData.set('destination', destText.trim())
    } else {
      formData.set('origin',      `${originCity}, ${originDept}`)
      formData.set('destination', `${destCity}, ${destDept}`)
    }
    formData.set('freight_value', freight)
    formData.set('weight_kg',    weightKg)
    formData.set('price_per_ton', pricePerTon)

    const result = isEdit
      ? await editarViajeAction(trip.id, formData)
      : await crearViajeAction(formData)

    if (result.ok) {
      router.push('/viajes')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al guardar el viaje')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">

      {/* Manifiesto */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Número de manifiesto</label>
        <input name="manifest_number" type="text" placeholder="Ej: 1234567"
          defaultValue={trip?.manifest_number ?? ''} className={INP} />
      </div>

      {/* Cliente / Vehículo */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Cliente *</label>
          <select name="tercero_id" required defaultValue={trip?.tercero_id ?? ''} className={SEL}>
            <option value="">Seleccionar cliente</option>
            {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Vehículo *</label>
          <select name="vehicle_id" required defaultValue={trip?.vehicle_id ?? ''} className={SEL}>
            <option value="">Seleccionar vehículo</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
          </select>
        </div>
      </div>

      {/* Conductor */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Conductor *</label>
        <select name="driver_id" required defaultValue={trip?.driver_id ?? ''} className={SEL}>
          <option value="">Seleccionar conductor</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      </div>

      {/* Origen */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Origen *</label>
        {isManifest ? (
          <input type="text" value={originText} onChange={e => setOriginText(e.target.value)}
            placeholder="Ej: BELLO ANTIOQUIA" className={INP} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select value={originDept} onChange={e => { setOriginDept(e.target.value); setOriginCity('') }} className={SEL}>
              <option value="">Departamento</option>
              {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={originCity} onChange={e => setOriginCity(e.target.value)} disabled={!originDept} className={SEL}>
              <option value="">Ciudad</option>
              {(COLOMBIA_GEO[originDept] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Destino */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Destino *</label>
        {isManifest ? (
          <input type="text" value={destText} onChange={e => setDestText(e.target.value)}
            placeholder="Ej: VALLEDUPAR CESAR" className={INP} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select value={destDept} onChange={e => { setDestDept(e.target.value); setDestCity('') }} className={SEL}>
              <option value="">Departamento</option>
              {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={destCity} onChange={e => setDestCity(e.target.value)} disabled={!destDept} className={SEL}>
              <option value="">Ciudad</option>
              {(COLOMBIA_GEO[destDept] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Fecha */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha de expedición *</label>
        <input name="load_date" required type="date" defaultValue={trip?.load_date ?? ''} className={INP} />
      </div>

      {/* Cálculo de flete */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-[#64748B]">Cálculo de flete</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#64748B] mb-1">Peso (kg)</label>
            <input type="number" min="0" step="0.01" placeholder="0"
              value={weightKg} onChange={e => handleWeightChange(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[#64748B] mb-1">Precio / tonelada (COP)</label>
            <input type="number" min="0" step="1" placeholder="0"
              value={pricePerTon} onChange={e => handlePriceChange(e.target.value)} className={INP} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#64748B] mb-1">
            Valor del flete (COP) *
            {previewFreight !== null && (
              <span className="ml-2 text-[#2563EB] font-medium">
                calculado: ${previewFreight.toLocaleString('es-CO')}
              </span>
            )}
          </label>
          <input type="number" min="0" required placeholder="0"
            value={freight} onChange={e => setFreight(e.target.value)} className={INP} />
        </div>
      </div>

      {/* Mercancía */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Mercancía transportada</label>
        <input name="load_content" type="text" placeholder="Ej: Maíz, Cemento, Acero..."
          defaultValue={trip?.load_content ?? ''} className={INP} />
      </div>

      {/* Anticipo */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Anticipo (COP)</label>
        <input name="advance_amount" type="number" min="0" placeholder="0"
          defaultValue={trip?.advance_amount ?? 0} className={INP} />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Notas</label>
        <textarea name="notes" rows={3} placeholder="Observaciones del viaje..."
          defaultValue={trip?.notes ?? ''} className={`${INP} resize-none`} />
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear viaje'}
        </button>
      </div>
    </form>
  )
}
