'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { Plus, Search, Building, X, RefreshCw, CheckCircle, Trash2 } from 'lucide-react'
import { crearClienteAction, actualizarClienteAction, sincronizarDataicoAction, eliminarClienteAction } from './actions'
import { useUrlState } from '@/lib/useUrlState'

interface Cliente {
  id: string
  name: string
  nit: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  created_at: string
  dataico_id: string | null
  third_party_type: string | null
  account_code: string | null
}

type DeleteState =
  | { phase: 'confirm'; item: Cliente }
  | { phase: 'warn'; item: Cliente; tripCount: number }
  | null

const INP = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-base md:text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

export default function ClientesClient({ clientes: initialClientes }: { clientes: Cliente[] }) {
  const [clientes, setClientes]   = useState(initialClientes)
  const [search,   setSearch]     = useUrlState('q')
  const [showForm, setShowForm]   = useState(false)
  const [editing,  setEditing]    = useState<Cliente | null>(null)
  const [loading,  setLoading]    = useState(false)
  const [syncing,  setSyncing]    = useState(false)
  const [syncMsg,  setSyncMsg]    = useState<{ ok: boolean; text: string } | null>(null)
  const [form,     setForm]       = useState({ name: '', nit: '', phone: '', email: '', address: '' })
  const [deleteState, setDeleteState] = useState<DeleteState>(null)
  const [deleting,    setDeleting]    = useState(false)

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    const res = await sincronizarDataicoAction()
    if (res.ok) {
      setSyncMsg({ ok: true, text: `${res.synced} terceros sincronizados desde Dataico` })
      window.location.reload()
    } else {
      setSyncMsg({ ok: false, text: res.error ?? 'Error desconocido' })
      setSyncing(false)
    }
  }

  const filtered = clientes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.nit ?? '').includes(search)
  )

  const openNew = () => {
    setEditing(null); setForm({ name: '', nit: '', phone: '', email: '', address: '' }); setShowForm(true)
  }

  const openEdit = (c: Cliente) => {
    setEditing(c)
    setForm({ name: c.name, nit: c.nit ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
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
      if (result.ok && result.data) { setClientes(prev => [result.data!, ...prev]); setShowForm(false) }
    }
    setLoading(false)
  }

  const handleDelete = async (force: boolean) => {
    const item = deleteState?.item; if (!item) return
    setDeleting(true)
    const res = await eliminarClienteAction(item.id, force)
    if (res.ok) {
      setClientes(prev => prev.filter(c => c.id !== item.id)); setDeleteState(null)
    } else if ('tripCount' in res) {
      setDeleteState({ phase: 'warn', item, tripCount: res.tripCount })
    }
    setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Clientes</h1>
          <p className="text-xs text-[#64748B] mt-0.5">{clientes.length} clientes registrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#64748B] text-sm font-medium px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar Dataico'}</span>
            <span className="sm:hidden">{syncing ? '...' : 'Dataico'}</span>
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]">
            <Plus size={15} /> Nuevo cliente
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
          syncMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {syncMsg.ok && <CheckCircle size={15} />}
          {syncMsg.text}
        </div>
      )}

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-full sm:w-72">
        <Search size={14} className="text-[#64748B] flex-shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o NIT..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">NIT</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Telefono</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Email</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-xs text-[#64748B]">
                <Building size={28} className="mx-auto mb-2 text-[#CBD5E1]" />No hay clientes
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-3 py-2">
                  <p className="text-xs font-medium text-[#0F172A]">{c.name}</p>
                  {c.dataico_id && <p className="text-[10px] text-[#94A3B8] mt-0.5">Dataico</p>}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{c.nit ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{c.phone ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{c.email ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                    c.third_party_type === 'PROVEEDOR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>{c.third_party_type ?? 'CLIENTE'}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(c)} className="text-xs text-[#2563EB] hover:underline font-medium">Editar</button>
                    <button onClick={() => setDeleteState({ phase: 'confirm', item: c })}
                      className="text-[#94A3B8] hover:text-red-500 transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#64748B]">
            <Building size={28} className="mx-auto mb-2 text-[#CBD5E1]" />No hay clientes
          </div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{c.name}</p>
                {c.nit && <p className="text-xs font-mono text-[#64748B] mt-0.5">{c.nit}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  c.third_party_type === 'PROVEEDOR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>{c.third_party_type ?? 'CLIENTE'}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {c.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
            {(c.phone || c.email) && (
              <p className="text-xs text-[#64748B] mt-1.5">
                {[c.phone, c.email].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 mt-2">
              <button onClick={() => openEdit(c)} className="text-xs text-[#2563EB] font-medium min-h-[36px] px-1">Editar</button>
              <button onClick={() => setDeleteState({ phase: 'confirm', item: c })}
                className="text-[#94A3B8] hover:text-red-500 transition-colors min-h-[36px] px-1">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-md shadow-xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1"><X size={18} className="text-[#64748B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { name: 'name',    label: 'Nombre *',    required: true,  placeholder: 'Nombre de la empresa' },
                { name: 'nit',     label: 'NIT',         required: false, placeholder: '000000000-0' },
                { name: 'phone',   label: 'Telefono',    required: false, placeholder: '601 234 5678' },
                { name: 'email',   label: 'Email',       required: false, placeholder: 'contacto@empresa.co' },
                { name: 'address', label: 'Direccion',   required: false, placeholder: 'Ciudad, Departamento' },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">{f.label}</label>
                  <input
                    value={form[f.name as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    required={f.required} placeholder={f.placeholder}
                    className={INP}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-3 rounded-lg text-sm hover:bg-[#F8FAFC]">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteState && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar cliente</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara <span className="font-medium text-[#0F172A]">{deleteState.item.name}</span> de forma permanente.
            </p>
            {deleteState.phase === 'warn' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                Este cliente tiene <span className="font-semibold">{deleteState.tripCount} viaje(s)</span> asociado(s). Los viajes seguiran existiendo pero sin cliente asignado.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteState(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-3 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteState.phase === 'warn')} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : deleteState.phase === 'warn' ? 'Eliminar de todas formas' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
