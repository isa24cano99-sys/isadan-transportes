'use client'

import { useState } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, Search, User, X } from 'lucide-react'
import { crearConductorAction, actualizarConductorAction } from './actions'

interface Conductor {
  id: string
  full_name: string
  document: string
  phone: string | null
  hire_date: string
  salary: number
  active: boolean
}

export default function ConductoresClient({ conductores: initial }: { conductores: Conductor[] }) {
  const [conductores, setConductores] = useState(initial)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Conductor | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', document: '', phone: '', hire_date: '', salary: '', active: 'true' })

  const filtered = conductores.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.document.includes(search)
  )

  const openNew = () => {
    setEditing(null)
    setForm({ full_name: '', document: '', phone: '', hire_date: '', salary: '', active: 'true' })
    setShowForm(true)
  }

  const openEdit = (c: Conductor) => {
    setEditing(c)
    setForm({ full_name: c.full_name, document: c.document, phone: c.phone ?? '', hire_date: c.hire_date, salary: c.salary.toString(), active: c.active.toString() })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData()
    Object.entries(form).forEach(([k, v]) => formData.set(k, v))
    if (editing) {
      formData.set('id', editing.id)
      const result = await actualizarConductorAction(formData)
      if (result.ok) {
        setConductores(prev => prev.map(c => c.id === editing.id ? { ...c, ...form, salary: Number(form.salary), active: form.active === 'true' } : c))
        setShowForm(false)
      }
    } else {
      const result = await crearConductorAction(formData)
      if (result.ok && result.data) {
        setConductores(prev => [...prev, result.data!])
        setShowForm(false)
      }
    }
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Conductores</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{conductores.length} conductores registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> Nuevo conductor
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-72">
        <Search size={14} className="text-[#64748B]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o documento..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Documento</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Teléfono</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Fecha ingreso</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Salario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-[#64748B]">
                <User size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                No hay conductores
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{c.full_name}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{c.document}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{formatDate(c.hire_date)}</td>
                <td className="px-4 py-3 text-sm font-medium text-[#0F172A] text-right">{formatCOP(c.salary)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(c)} className="text-xs text-[#2563EB] hover:underline font-medium">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">{editing ? 'Editar conductor' : 'Nuevo conductor'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-[#64748B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Nombre completo *</label>
                <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  required placeholder="Carlos Andrés Rueda"
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Documento *</label>
                  <input value={form.document} onChange={e => setForm(p => ({ ...p, document: e.target.value }))}
                    required placeholder="71234567"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Teléfono</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="3109876543"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibond text-[#64748B] mb-1.5">Fecha ingreso *</label>
                  <input value={form.hire_date} onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))}
                    required type="date"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Salario *</label>
                  <input value={form.salary} onChange={e => setForm(p => ({ ...p, salary: e.target.value }))}
                    required type="number" min="0" placeholder="2800000"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Estado</label>
                <select value={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
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
    </div>
  )
}
