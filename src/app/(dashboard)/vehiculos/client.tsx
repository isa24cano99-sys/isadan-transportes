'use client'

import { useState } from 'react'
import { Plus, Search, Truck, X, Trash2 } from 'lucide-react'
import { crearVehiculoAction, actualizarVehiculoAction, eliminarVehiculoAction } from './actions'
import { useUrlState } from '@/lib/useUrlState'

interface Vehiculo {
  id: string
  plate: string
  brand: string
  model: string
  year: number
  status: 'ACTIVO' | 'TALLER' | 'INACTIVO'
  notes: string | null
}

type DeleteState =
  | { phase: 'confirm'; item: Vehiculo }
  | { phase: 'warn'; item: Vehiculo; tripCount: number }
  | null

const statusConfig = {
  ACTIVO:   { label: 'Activo',    className: 'bg-green-100 text-green-700' },
  TALLER:   { label: 'En taller', className: 'bg-yellow-100 text-yellow-700' },
  INACTIVO: { label: 'Inactivo',  className: 'bg-gray-100 text-gray-600' },
}

export default function VehiculosClient({ vehiculos: initial }: { vehiculos: Vehiculo[] }) {
  const [vehiculos, setVehiculos] = useState(initial)
  const [search,    setSearch]    = useUrlState('q')
  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState<Vehiculo | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [form, setForm] = useState({ plate: '', brand: '', model: '', year: new Date().getFullYear().toString(), status: 'ACTIVO', notes: '' })
  const [deleteState, setDeleteState] = useState<DeleteState>(null)
  const [deleting,    setDeleting]    = useState(false)

  const filtered = vehiculos.filter(v =>
    v.plate.toLowerCase().includes(search.toLowerCase()) ||
    v.brand.toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => {
    setEditing(null)
    setForm({ plate: '', brand: '', model: '', year: new Date().getFullYear().toString(), status: 'ACTIVO', notes: '' })
    setShowForm(true)
  }

  const openEdit = (v: Vehiculo) => {
    setEditing(v)
    setForm({ plate: v.plate, brand: v.brand, model: v.model, year: v.year.toString(), status: v.status, notes: v.notes ?? '' })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData()
    Object.entries(form).forEach(([k, v]) => formData.set(k, v))
    if (editing) {
      formData.set('id', editing.id)
      const result = await actualizarVehiculoAction(formData)
      if (result.ok) {
        setVehiculos(prev => prev.map(v => v.id === editing.id ? { ...v, ...form, year: Number(form.year), status: form.status as any } : v))
        setShowForm(false)
      }
    } else {
      const result = await crearVehiculoAction(formData)
      if (result.ok && result.data) {
        setVehiculos(prev => [...prev, result.data!])
        setShowForm(false)
      }
    }
    setLoading(false)
  }

  const handleDelete = async (force: boolean) => {
    const item = deleteState?.item
    if (!item) return
    setDeleting(true)
    const res = await eliminarVehiculoAction(item.id, force)
    if (res.ok) {
      setVehiculos(prev => prev.filter(v => v.id !== item.id))
      setDeleteState(null)
    } else if ('tripCount' in res) {
      setDeleteState({ phase: 'warn', item, tripCount: res.tripCount })
    }
    setDeleting(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Vehiculos</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{vehiculos.length} vehiculos registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> Nuevo vehiculo
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-72">
        <Search size={14} className="text-[#64748B]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa o marca..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-2 text-center py-10 text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl">
            <Truck size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
            No hay vehiculos
          </div>
        ) : filtered.map(v => {
          const st = statusConfig[v.status]
          return (
            <div key={v.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Truck size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-[#0F172A] text-lg">{v.plate}</p>
                    <p className="text-sm text-[#64748B]">{v.brand} {v.model} · {v.year}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${st.className}`}>{st.label}</span>
              </div>
              {v.notes && <p className="text-xs text-[#64748B] mb-3">{v.notes}</p>}
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(v)} className="text-xs text-[#2563EB] hover:underline font-medium">
                  Editar
                </button>
                <button onClick={() => setDeleteState({ phase: 'confirm', item: v })}
                  className="text-[#94A3B8] hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">{editing ? 'Editar vehiculo' : 'Nuevo vehiculo'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-[#64748B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Placa *</label>
                  <input value={form.plate} onChange={e => setForm(p => ({ ...p, plate: e.target.value.toUpperCase() }))}
                    required placeholder="SQF-847"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Ano *</label>
                  <input value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                    required type="number" min="1990" max="2030"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Marca *</label>
                  <input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
                    required placeholder="Kenworth"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Modelo *</label>
                  <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                    required placeholder="T680"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Estado</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="ACTIVO">Activo</option>
                  <option value="TALLER">En taller</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Observaciones..."
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar vehiculo</h2>
            <p className="text-sm text-[#64748B]">
              Se eliminara <span className="font-medium text-[#0F172A]">{deleteState.item.plate}</span> de forma permanente.
            </p>
            {deleteState.phase === 'warn' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                Este vehiculo tiene <span className="font-semibold">{deleteState.tripCount} viaje(s)</span> asociado(s). Los viajes seguiran existiendo pero sin vehiculo asignado.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteState(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteState.phase === 'warn')} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : deleteState.phase === 'warn' ? 'Eliminar de todas formas' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
