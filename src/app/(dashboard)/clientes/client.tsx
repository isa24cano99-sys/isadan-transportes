'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { Plus, Search, Building, X } from 'lucide-react'
import { crearClienteAction, actualizarClienteAction } from './actions'

interface Cliente {
  id: string
  name: string
  nit: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  created_at: string
}

interface Props {
  clientes: Cliente[]
}

export default function ClientesClient({ clientes: initialClientes }: Props) {
  const [clientes, setClientes] = useState(initialClientes)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', nit: '', phone: '', email: '', address: '' })

  const filtered = clientes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.nit ?? '').includes(search)
  )

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', nit: '', phone: '', email: '', address: '' })
    setShowForm(true)
  }

  const openEdit = (c: Cliente) => {
    setEditing(c)
    setForm({ name: c.name, nit: c.nit ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData()
    Object.entries(form).forEach(([k, v]) => formData.set(k, v))
    if (editing) {
      formData.set('id', editing.id)
      const result = await actualizarClienteAction(formData)
      if (result.ok) {
        setClientes(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } : c))
        setShowForm(false)
      }
    } else {
      const result = await crearClienteAction(formData)
      if (result.ok && result.data) {
        setClientes(prev => [result.data!, ...prev])
        setShowForm(false)
      }
    }
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Clientes</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{clientes.length} clientes registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> Nuevo cliente
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-72">
        <Search size={14} className="text-[#64748B]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o NIT..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">NIT</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Teléfono</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-sm text-[#64748B]">
                <Building size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                No hay clientes
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{c.name}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{c.nit ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-[#64748B]">{c.email ?? '—'}</td>
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
              <h2 className="font-semibold text-[#0F172A]">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-[#64748B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { name: 'name', label: 'Nombre *', required: true, placeholder: 'Nombre de la empresa' },
                { name: 'nit', label: 'NIT', required: false, placeholder: '000000000-0' },
                { name: 'phone', label: 'Teléfono', required: false, placeholder: '601 234 5678' },
                { name: 'email', label: 'Email', required: false, placeholder: 'contacto@empresa.co' },
                { name: 'address', label: 'Dirección', required: false, placeholder: 'Ciudad, Departamento' },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">{f.label}</label>
                  <input
                    value={form[f.name as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    required={f.required}
                    placeholder={f.placeholder}
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              ))}
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
