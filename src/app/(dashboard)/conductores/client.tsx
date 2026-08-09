'use client'

import { useState } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, Search, User, X, Trash2 } from 'lucide-react'
import { crearConductorAction, actualizarConductorAction, eliminarConductorAction } from './actions'
import { useUrlState } from '@/lib/useUrlState'

interface Conductor {
  id: string
  full_name: string
  document: string
  phone: string | null
  hire_date: string
  salary: number
  auxilio_transporte: number
  active: boolean
  address: string | null
  eps: string | null
  arl: string | null
  personal_references: string | null
  work_references: string | null
}

type FormState = {
  full_name: string; document: string; phone: string; hire_date: string; salary: string; auxilio_transporte: string; active: string
  address: string; eps: string; arl: string; personal_references: string; work_references: string
}

const EMPTY_FORM: FormState = {
  full_name: '', document: '', phone: '', hire_date: '', salary: '', auxilio_transporte: '', active: 'true',
  address: '', eps: '', arl: '', personal_references: '', work_references: '',
}

type DeleteState =
  | { phase: 'confirm'; item: Conductor }
  | { phase: 'warn'; item: Conductor; tripCount: number; legCount: number }
  | null

const INP = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
const LBL = 'block text-xs font-semibold text-[#64748B] mb-1.5'

export default function ConductoresClient({ conductores: initial }: { conductores: Conductor[] }) {
  const [conductores, setConductores] = useState(initial)
  const [search,    setSearch]    = useUrlState('q')
  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState<Conductor | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM)
  const [deleteState, setDeleteState] = useState<DeleteState>(null)
  const [deleting,    setDeleting]    = useState(false)

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }))

  const filtered = conductores.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) || c.document.includes(search)
  )

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true) }

  const openEdit = (c: Conductor) => {
    setEditing(c)
    setForm({
      full_name: c.full_name, document: c.document, phone: c.phone ?? '',
      hire_date: c.hire_date, salary: c.salary.toString(),
      auxilio_transporte: (c.auxilio_transporte ?? 0).toString(), active: c.active.toString(),
      address: c.address ?? '', eps: c.eps ?? '', arl: c.arl ?? '',
      personal_references: c.personal_references ?? '', work_references: c.work_references ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    if (editing) {
      fd.set('id', editing.id)
      const result = await actualizarConductorAction(fd)
      if (result.ok) {
        setConductores(prev => prev.map(c => c.id === editing.id
          ? { ...c, ...form, salary: Number(form.salary), auxilio_transporte: Number(form.auxilio_transporte) || 0, active: form.active === 'true' } : c))
        setShowForm(false)
      }
    } else {
      const result = await crearConductorAction(fd)
      if (result.ok && result.data) {
        setConductores(prev => [...prev, result.data!])
        setShowForm(false)
      }
    }
    setLoading(false)
  }

  const handleDelete = async (force: boolean) => {
    const item = deleteState?.item
    if (!item) return
    setDeleting(true)
    const res = await eliminarConductorAction(item.id, force)
    if (res.ok) {
      setConductores(prev => prev.filter(c => c.id !== item.id))
      setDeleteState(null)
    } else if ('tripCount' in res) {
      setDeleteState({ phase: 'warn', item, tripCount: res.tripCount, legCount: res.legCount })
    }
    setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Conductores</h1>
          <p className="text-xs text-[#64748B] mt-0.5">{conductores.length} conductores registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]">
          <Plus size={15} /> Nuevo conductor
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-full sm:w-72">
        <Search size={14} className="text-[#64748B] flex-shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o documento..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Documento</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Teléfono</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">EPS / ARL</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Fecha ingreso</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Salario</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-xs text-[#64748B]">
                <User size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                No hay conductores
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-3 py-2">
                  <p className="text-xs font-medium text-[#0F172A]">{c.full_name}</p>
                  {c.address && <p className="text-xs text-[#94A3B8] mt-0.5">{c.address}</p>}
                </td>
                <td className="px-3 py-2 text-xs text-[#64748B]">{c.document}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{c.phone ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">
                  {c.eps && <p>{c.eps}</p>}
                  {c.arl && <p className="text-xs text-[#94A3B8]">{c.arl}</p>}
                  {!c.eps && !c.arl && '—'}
                </td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{formatDate(c.hire_date)}</td>
                <td className="px-3 py-2 text-xs font-medium text-[#0F172A] text-right">{formatCOP(c.salary)}</td>
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
            <User size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
            No hay conductores
          </div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A]">{c.full_name}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{c.document}{c.phone ? ` · ${c.phone}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {c.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-bold text-[#0F172A]">{formatCOP(c.salary)}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(c)} className="text-xs text-[#2563EB] font-medium min-h-[36px] px-1">Editar</button>
                <button onClick={() => setDeleteState({ phase: 'confirm', item: c })}
                  className="text-[#94A3B8] hover:text-red-500 transition-colors min-h-[36px] px-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-lg shadow-xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">{editing ? 'Editar conductor' : 'Nuevo conductor'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1"><X size={18} className="text-[#64748B]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={LBL}>Nombre completo *</label>
                <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
                  required placeholder="Carlos Andrés Rueda" className={INP} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Documento *</label>
                  <input value={form.document} onChange={e => set('document', e.target.value)}
                    required placeholder="71234567" className={INP} />
                </div>
                <div>
                  <label className={LBL}>Teléfono</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="3109876543" className={INP} />
                </div>
              </div>
              <div>
                <label className={LBL}>Dirección</label>
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  placeholder="Cra 50 # 12-34, Medellín" className={INP} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>EPS</label>
                  <input value={form.eps} onChange={e => set('eps', e.target.value)}
                    placeholder="Sura, Famisanar..." className={INP} />
                </div>
                <div>
                  <label className={LBL}>ARL</label>
                  <input value={form.arl} onChange={e => set('arl', e.target.value)}
                    placeholder="Positiva, Sura..." className={INP} />
                </div>
              </div>
              <div>
                <label className={LBL}>Referencias personales</label>
                <textarea value={form.personal_references} onChange={e => set('personal_references', e.target.value)}
                  rows={2} placeholder="Nombre: Juan Pérez — Tel: 3001234567"
                  className={`${INP} resize-none`} />
              </div>
              <div>
                <label className={LBL}>Referencias laborales</label>
                <textarea value={form.work_references} onChange={e => set('work_references', e.target.value)}
                  rows={2} placeholder="Empresa: Transportes XYZ — Tel: 6041234567"
                  className={`${INP} resize-none`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Fecha ingreso *</label>
                  <input value={form.hire_date} onChange={e => set('hire_date', e.target.value)}
                    required type="date" className={INP} />
                </div>
                <div>
                  <label className={LBL}>Salario *</label>
                  <input value={form.salary} onChange={e => set('salary', e.target.value)}
                    required type="number" min="0" placeholder="1750905" className={INP} />
                </div>
              </div>
              <div>
                <label className={LBL}>Auxilio de transporte</label>
                <input value={form.auxilio_transporte} onChange={e => set('auxilio_transporte', e.target.value)}
                  type="number" min="0" placeholder="249095" className={INP} />
                <p className="text-[11px] text-[#94A3B8] mt-1">Valor pleno mensual (2026: $249.095). Solo para quienes ganan ≤ 2 SMMLV; deja 0 si no aplica.</p>
              </div>
              <div>
                <label className={LBL}>Estado</label>
                <select value={form.active} onChange={e => set('active', e.target.value)}
                  className={`${INP} bg-white`}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
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
            <h2 className="font-semibold text-[#0F172A]">Eliminar conductor</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara <span className="font-medium text-[#0F172A]">{deleteState.item.full_name}</span> de forma permanente.
            </p>
            {deleteState.phase === 'warn' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800 space-y-1">
                {deleteState.tripCount > 0 && (
                  <p>Este conductor tiene <span className="font-semibold">{deleteState.tripCount} viaje(s)</span> asociado(s).</p>
                )}
                {deleteState.legCount > 0 && (
                  <p>Este conductor tiene <span className="font-semibold">{deleteState.legCount} legalizacion(es)</span> asociada(s).</p>
                )}
                <p className="text-xs mt-1">Los registros seguiran existiendo pero sin conductor asignado.</p>
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
