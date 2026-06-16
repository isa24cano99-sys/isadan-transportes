'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearViajeAction } from './actions'

interface Props {
  clients: { id: string; name: string; nit: string | null }[]
  vehicles: { id: string; plate: string; brand: string; model: string }[]
  drivers: { id: string; full_name: string }[]
}

export default function NuevoViajeForm({ clients, vehicles, drivers }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await crearViajeAction(formData)
    if (result.ok) {
      router.push('/viajes')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al crear el viaje')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Cliente *</label>
          <select name="client_id" required
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
            <option value="">Seleccionar cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Vehículo *</label>
          <select name="vehicle_id" required
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
            <option value="">Seleccionar vehículo</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Conductor *</label>
        <select name="driver_id" required
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">Seleccionar conductor</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Origen *</label>
          <input name="origin" required type="text" placeholder="Ciudad de origen"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Destino *</label>
          <input name="destination" required type="text" placeholder="Ciudad de destino"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha de cargue *</label>
          <input name="load_date" required type="date"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha de entrega</label>
          <input name="delivery_date" type="date"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Valor del flete (COP) *</label>
          <input name="freight_value" required type="number" min="0" placeholder="0"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Anticipo (COP)</label>
          <input name="advance_amount" type="number" min="0" placeholder="0"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Notas</label>
        <textarea name="notes" rows={3} placeholder="Observaciones del viaje..."
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {loading ? 'Guardando...' : 'Crear viaje'}
        </button>
      </div>
    </form>
  )
}
