'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  sincronizarProveedoresAction, actualizarProveedorAction, eliminarProveedorAction,
  moverAClienteAction, eliminarDeCatalogoAction, type MergedRow,
} from './actions'
import {
  RefreshCw, CheckCircle, Truck, Search, Mail, Phone, Pencil, Trash2, X,
  AlertTriangle, UserPlus, Users,
} from 'lucide-react'

const PARTY_LABELS: Record<string, string> = {
  PERSONA_JURIDICA: 'Jurídica',
  PERSONA_NATURAL:  'Natural',
}

type Filter = 'PROVEEDORES' | 'CLIENTES' | 'TODOS'

type EditForm = { name: string; category: string; account_code: string }

export default function ProveedoresClient({ initial }: { initial: MergedRow[] }) {
  const router = useRouter()
  const [rows,    setRows]    = useState<MergedRow[]>(initial)
  const [filter,  setFilter]  = useState<Filter>('TODOS')
  const [search,  setSearch]  = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Editar / eliminar proveedor (solo filas con supplier_id)
  const [editTarget,   setEditTarget]   = useState<MergedRow | null>(null)
  const [editForm,     setEditForm]     = useState<EditForm | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MergedRow | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  // Mover a clientes
  const [moving,      setMoving]      = useState<string | null>(null)
  const [moveConfirm, setMoveConfirm] = useState<{ row: MergedRow; created: boolean } | null>(null)
  const [removingCat, setRemovingCat] = useState(false)
  const [rowMsg,      setRowMsg]      = useState<Record<string, string>>({})

  const clientes    = useMemo(() => rows.filter(r => r.is_client), [rows])
  const proveedores = useMemo(() => rows.filter(r => !r.is_client), [rows])
  const duplicados  = useMemo(() => rows.filter(r => r.exists_in_clients), [rows])

  const base = filter === 'CLIENTES' ? clientes : filter === 'PROVEEDORES' ? proveedores : rows
  const filtered = base.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.nit ?? '').includes(search) ||
    (r.email ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    const res = await sincronizarProveedoresAction()
    if (res.ok) {
      const parts = []
      if (res.inserted) parts.push(`${res.inserted} nuevos`)
      if (res.updated)  parts.push(`${res.updated} actualizados`)
      if (res.enriched) parts.push(`${res.enriched} enriquecidos con Dataico`)
      setSyncMsg({ ok: true, text: parts.length ? parts.join(' · ') : (res as any).message ?? 'Sin cambios' })
      if (res.inserted || res.updated) { router.refresh(); setSyncing(false) }
      else setSyncing(false)
    } else {
      setSyncMsg({ ok: false, text: (res as any).error ?? 'Error desconocido' }); setSyncing(false)
    }
  }

  const openEdit = (r: MergedRow) => {
    setEditTarget(r)
    setEditForm({ name: r.name, category: r.category ?? '', account_code: r.account_code ?? '' })
  }

  const handleSave = async () => {
    if (!editTarget?.supplier_id || !editForm) return
    setSaving(true)
    const res = await actualizarProveedorAction(editTarget.supplier_id, {
      name:         editForm.name.trim(),
      category:     editForm.category.trim() || null,
      account_code: editForm.account_code.trim() || null,
    })
    if (res.ok) {
      setRows(prev => prev.map(r => r.key === editTarget.key
        ? { ...r, name: editForm.name.trim(), category: editForm.category || null, account_code: editForm.account_code || null }
        : r))
      setEditTarget(null); setEditForm(null)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget?.supplier_id) return
    setDeleting(true)
    const res = await eliminarProveedorAction(deleteTarget.supplier_id)
    if (res.ok) {
      // Si además está en el catálogo, la fila permanece como catalog-only; si no, se elimina.
      setRows(prev => prev.flatMap(r => {
        if (r.key !== deleteTarget.key) return [r]
        return r.catalog_id ? [{ ...r, supplier_id: null, category: null, account_code: null, email: null, phone: null, dataico_id: null }] : []
      }))
      setDeleteTarget(null)
    }
    setDeleting(false)
  }

  const handleMover = async (r: MergedRow) => {
    setMoving(r.key)
    setRowMsg(m => { const n = { ...m }; delete n[r.key]; return n })
    const res = await moverAClienteAction(r.nit, r.name)
    setMoving(null)
    if (!res.ok) {
      setRowMsg(m => ({ ...m, [r.key]: res.error ?? 'Error al mover' }))
      return
    }
    // Marcar como ya-cliente y preguntar si se elimina del catálogo
    setRows(prev => prev.map(x => x.key === r.key ? { ...x, exists_in_clients: true } : x))
    if (r.catalog_id) setMoveConfirm({ row: r, created: res.created })
    else setRowMsg(m => ({ ...m, [r.key]: res.created ? 'Creado en clientes' : 'Ya existía en clientes' }))
  }

  const handleRemoveCatalog = async () => {
    if (!moveConfirm?.row.catalog_id) return
    setRemovingCat(true)
    const res = await eliminarDeCatalogoAction(moveConfirm.row.catalog_id)
    if (res.ok) {
      const key = moveConfirm.row.key
      setRows(prev => prev.flatMap(r => {
        if (r.key !== key) return [r]
        // Si también es proveedor (suppliers), queda como proveedor sin categoría; si no, se elimina.
        return r.supplier_id ? [{ ...r, catalog_id: null, categoria: null, is_client: false }] : []
      }))
      setMoveConfirm(null)
    }
    setRemovingCat(false)
  }

  const inpCls ='w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const lblCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  const TABS: { id: Filter; label: string; count: number }[] = [
    { id: 'TODOS',       label: 'Todos',       count: rows.length },
    { id: 'PROVEEDORES', label: 'Proveedores', count: proveedores.length },
    { id: 'CLIENTES',    label: 'Clientes',    count: clientes.length },
  ]

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Proveedores y clientes</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Fusión de <span className="font-medium">suppliers</span> + <span className="font-medium">supplier_catalog</span> · {rows.length} registros
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando…' : 'Sincronizar desde DIAN'}
        </button>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
          syncMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {syncMsg.ok && <CheckCircle size={15} />}{syncMsg.text}
        </div>
      )}

      {/* Aviso de duplicados */}
      {duplicados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {duplicados.length} NIT también existe{duplicados.length !== 1 ? 'n' : ''} en la tabla de clientes
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Estos registros están tanto en clientes como en proveedores/catálogo. Revisa si deben quedar solo como clientes.
            </p>
          </div>
        </div>
      )}

      {/* Filtro + búsqueda */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === t.id ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}>
              {t.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E2E8F0] text-[#64748B] font-bold">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 w-72">
          <Search size={14} className="text-[#64748B] flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, NIT o email…"
            className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre / Razón social</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">NIT</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Categoría</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Email</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Teléfono</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
                    <Truck size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">Sin resultados</p>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.key} className="hover:bg-[#F8FAFC] transition-colors align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-medium text-[#0F172A]">{r.name}</p>
                      {r.is_client && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          <Users size={9} /> Cliente
                        </span>
                      )}
                      {r.exists_in_clients && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Ya es cliente</span>
                      )}
                      {r.dataico_id && <span className="text-[10px] text-[#2563EB]">● Dataico</span>}
                    </div>
                    {rowMsg[r.key] && <p className="text-[10px] text-[#64748B] mt-0.5">{rowMsg[r.key]}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{r.nit || '—'}</td>
                  <td className="px-3 py-2">
                    {r.categoria ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.is_client ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>{r.categoria}</span>
                    ) : r.category ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {PARTY_LABELS[r.category] ?? r.category}
                      </span>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                        <Mail size={11} />{r.email}
                      </a>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.phone ? (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]"><Phone size={11} />{r.phone}</span>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      {r.is_client && (
                        <button onClick={() => handleMover(r)} disabled={moving === r.key || !r.nit}
                          title={!r.nit ? 'Sin NIT' : undefined}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 px-2 py-1 rounded-lg border border-emerald-200">
                          {moving === r.key ? <RefreshCw size={11} className="animate-spin" /> : <UserPlus size={11} />}
                          Mover a clientes
                        </button>
                      )}
                      {r.supplier_id && (
                        <>
                          <button onClick={() => openEdit(r)}
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium px-1.5 py-1">
                            <Pencil size={11} /> Editar
                          </button>
                          <button onClick={() => setDeleteTarget(r)}
                            className="text-[#94A3B8] hover:text-red-500 transition-colors p-1">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal (solo proveedores en suppliers) */}
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
                <input value={editForm.name} onChange={e => setEditForm(p => p && ({ ...p, name: e.target.value }))} required className={inpCls} />
              </div>
              <div>
                <label className={lblCls}>Tipo de persona</label>
                <select value={editForm.category} onChange={e => setEditForm(p => p && ({ ...p, category: e.target.value }))} className={inpCls}>
                  <option value="">Sin especificar</option>
                  <option value="PERSONA_JURIDICA">Jurídica</option>
                  <option value="PERSONA_NATURAL">Natural</option>
                </select>
              </div>
              <div>
                <label className={lblCls}>Código contable</label>
                <input value={editForm.account_code} onChange={e => setEditForm(p => p && ({ ...p, account_code: e.target.value }))} placeholder="220505" className={inpCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTarget(null)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !editForm.name.trim()} className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete provider modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar proveedor</h2>
            <p className="text-sm text-[#64748B]">
              Se eliminará <span className="font-medium text-[#0F172A]">{deleteTarget.name}</span> de la tabla de proveedores.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar del catálogo tras mover a clientes */}
      {moveConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-green-600" />
              <h2 className="font-semibold text-[#0F172A]">
                {moveConfirm.created ? 'Cliente creado' : 'Ya existía como cliente'}
              </h2>
            </div>
            <p className="text-sm text-[#64748B]">
              <span className="font-medium text-[#0F172A]">{moveConfirm.row.name}</span>{' '}
              {moveConfirm.created ? 'se creó en la tabla de clientes.' : 'ya estaba en la tabla de clientes.'}{' '}
              ¿Eliminarlo del catálogo de proveedores (<span className="font-mono text-xs">supplier_catalog</span>)?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setMoveConfirm(null)} disabled={removingCat} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">No, dejarlo</button>
              <button onClick={handleRemoveCatalog} disabled={removingCat} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {removingCat ? 'Eliminando...' : 'Sí, eliminar del catálogo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
