'use client'

import { useState } from 'react'
import { sincronizarProveedoresAction, actualizarProveedorAction, eliminarProveedorAction, type Supplier } from './actions'
import { RefreshCw, CheckCircle, Truck, Search, Mail, Phone, Pencil, Trash2, X } from 'lucide-react'

const PARTY_LABELS: Record<string, string> = {
  PERSONA_JURIDICA: 'Jurídica',
  PERSONA_NATURAL:  'Natural',
}

type EditForm = { name: string; category: string; account_code: string }

export default function ProveedoresClient({ initial }: { initial: Supplier[] }) {
  const [suppliers,    setSuppliers]    = useState<Supplier[]>(initial)
  const [syncing,      setSyncing]      = useState(false)
  const [syncMsg,      setSyncMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [search,       setSearch]       = useState('')
  const [editTarget,   setEditTarget]   = useState<Supplier | null>(null)
  const [editForm,     setEditForm]     = useState<EditForm | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.nit ?? '').includes(search) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    const res = await sincronizarProveedoresAction()
    if (res.ok) {
      const parts = []
      if (res.inserted) parts.push(`${res.inserted} nuevos`)
      if (res.updated)  parts.push(`${res.updated} actualizados`)
      if (res.enriched) parts.push(`${res.enriched} enriquecidos con Dataico`)
      setSyncMsg({
        ok: true,
        text: parts.length ? parts.join(' · ') : (res as any).message ?? 'Sin cambios',
      })
      if (res.inserted || res.updated) window.location.reload()
      else setSyncing(false)
    } else {
      setSyncMsg({ ok: false, text: (res as any).error ?? 'Error desconocido' })
      setSyncing(false)
    }
  }

  const openEdit = (s: Supplier) => {
    setEditTarget(s)
    setEditForm({ name: s.name, category: s.category ?? '', account_code: s.account_code ?? '' })
  }

  const handleSave = async () => {
    if (!editTarget || !editForm) return
    setSaving(true)
    const res = await actualizarProveedorAction(editTarget.id, {
      name:         editForm.name.trim(),
      category:     editForm.category.trim() || null,
      account_code: editForm.account_code.trim() || null,
    })
    if (res.ok) {
      setSuppliers(prev => prev.map(s => s.id === editTarget.id
        ? { ...s, name: editForm.name.trim(), category: editForm.category || null, account_code: editForm.account_code || null }
        : s
      ))
      setEditTarget(null)
      setEditForm(null)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await eliminarProveedorAction(deleteTarget.id)
    if (res.ok) {
      setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
    setDeleting(false)
  }

  const fmtDate = (s: string) => {
    try {
      return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .format(new Date(s))
    } catch { return s }
  }

  const inpCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const lblCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Proveedores</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Empresas que emiten facturas a ISADAN · fuente: reporte DIAN + Dataico
            {suppliers.length > 0 && ` · ${suppliers.length} registros`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando…' : 'Sincronizar desde DIAN'}
        </button>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
          syncMsg.ok
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {syncMsg.ok && <CheckCircle size={15} />}
          {syncMsg.text}
        </div>
      )}

      {suppliers.length === 0 && !syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-4 text-sm text-blue-700">
          Los proveedores se extraen automáticamente de los NIT emisores en tus facturas DIAN importadas.
          Asegúrate de haber importado el reporte DIAN en{' '}
          <a href="/facturas/importar" className="font-semibold underline">Facturación DIAN → Importar</a>{' '}
          antes de sincronizar.
        </div>
      )}

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-80">
        <Search size={14} className="text-[#64748B] flex-shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, NIT o email…"
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent"
        />
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre / Razón social</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">NIT</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Categoría</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Email</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Teléfono</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Actualizado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-14">
                  <Truck size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#64748B]">
                    {suppliers.length === 0
                      ? 'Sin proveedores — sincroniza desde el reporte DIAN'
                      : 'Sin resultados para la búsqueda'}
                  </p>
                </td>
              </tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-3 py-2">
                  <p className="text-xs font-medium text-[#0F172A]">{s.name}</p>
                  {s.dataico_id && (
                    <p className="text-[10px] text-[#2563EB] mt-0.5">● Dataico</p>
                  )}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{s.nit || '—'}</td>
                <td className="px-3 py-2">
                  {s.category ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                      {PARTY_LABELS[s.category] ?? s.category}
                    </span>
                  ) : <span className="text-xs text-[#94A3B8]">—</span>}
                </td>
                <td className="px-3 py-2">
                  {s.email ? (
                    <a href={`mailto:${s.email}`}
                      className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                      <Mail size={11} />{s.email}
                    </a>
                  ) : <span className="text-xs text-[#94A3B8]">—</span>}
                </td>
                <td className="px-3 py-2">
                  {s.phone ? (
                    <span className="flex items-center gap-1 text-xs text-[#64748B]">
                      <Phone size={11} />{s.phone}
                    </span>
                  ) : <span className="text-xs text-[#94A3B8]">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[#94A3B8]">{fmtDate(s.updated_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openEdit(s)}
                      className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium px-1.5 py-1">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => setDeleteTarget(s)}
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

      {/* Edit modal */}
      {editTarget && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">Editar proveedor</h2>
              <button onClick={() => setEditTarget(null)}><X size={18} className="text-[#64748B]" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={lblCls}>Nombre / Razón social *</label>
                <input value={editForm.name} onChange={e => setEditForm(p => p && ({ ...p, name: e.target.value }))}
                  required className={inpCls} />
              </div>
              <div>
                <label className={lblCls}>Categoría</label>
                <select value={editForm.category} onChange={e => setEditForm(p => p && ({ ...p, category: e.target.value }))}
                  className={inpCls}>
                  <option value="">Sin categoría</option>
                  <option value="PERSONA_JURIDICA">Jurídica</option>
                  <option value="PERSONA_NATURAL">Natural</option>
                </select>
              </div>
              <div>
                <label className={lblCls}>Código contable</label>
                <input value={editForm.account_code} onChange={e => setEditForm(p => p && ({ ...p, account_code: e.target.value }))}
                  placeholder="220505" className={inpCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !editForm.name.trim()}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar proveedor</h2>
            <p className="text-sm text-[#64748B]">
              Se eliminara <span className="font-medium text-[#0F172A]">{deleteTarget.name}</span> de forma permanente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
