'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Paperclip, Trash2, FileText, Pencil } from 'lucide-react'
import { crearDocumentoAction, eliminarDocumentoAction, actualizarDocumentoAction, getSignedUrlAction } from './actions'

// ── Types ─────────────────────────────────────────────────────────────────────

type Vehicle = { id: string; plate: string }
type Driver  = { id: string; full_name: string }

export type DocumentRow = {
  id: string
  category: string
  entity_type: string
  entity_id: string | null
  file_path: string | null
  file_name: string
  expiration_date: string | null
  notes: string | null
  created_at: string
  entityName?: string
  daysLeft?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['SOAT', 'TECNOMECANICA', 'POLIZA', 'CONTRATO', 'LICENCIA', 'RUT', 'OTRO'] as const
const ENTITY_TYPES = ['VEHICULO', 'CONDUCTOR', 'EMPRESA', 'OTRO'] as const

// UUID placeholder para entidades sin ID específico (EMPRESA, OTRO)
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000001'

const CATEGORY_LABELS: Record<string, string> = {
  SOAT:          'SOAT',
  TECNOMECANICA: 'Tecnomecánica',
  POLIZA:        'Póliza',
  CONTRATO:      'Contrato',
  LICENCIA:      'Licencia',
  RUT:           'RUT',
  OTRO:          'Otro',
}

const ENTITY_LABELS: Record<string, string> = {
  VEHICULO:  'Vehículo',
  CONDUCTOR: 'Conductor',
  EMPRESA:   'Empresa',
  OTRO:      'Otro',
}

// ── Expiry helpers ─────────────────────────────────────────────────────────────

export function getAlertLevel(daysLeft: number | undefined): 'red' | 'yellow' | 'green' | 'none' {
  if (daysLeft === undefined) return 'none'
  if (daysLeft < 30)  return 'red'
  if (daysLeft < 60)  return 'yellow'
  return 'green'
}

export function expiryBadge(daysLeft: number | undefined) {
  if (daysLeft === undefined) return { label: 'Sin vencimiento', cls: 'bg-[#F1F5F9] text-[#64748B]' }
  if (daysLeft < 0)  return { label: `Vencido (${Math.abs(daysLeft)} días)`,  cls: 'bg-red-100 text-red-700' }
  if (daysLeft === 0) return { label: 'Vence hoy',                             cls: 'bg-red-100 text-red-700' }
  if (daysLeft < 30)  return { label: `Vence en ${daysLeft} días`,             cls: 'bg-red-100 text-red-700' }
  if (daysLeft < 60)  return { label: `Vence en ${daysLeft} días`,             cls: 'bg-yellow-100 text-yellow-700' }
  return                      { label: `Vence en ${daysLeft} días`,             cls: 'bg-green-100 text-green-700' }
}

// ── Open file (signed URL) ─────────────────────────────────────────────────────

function OpenFileButton({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    setLoading(true)
    const res = await getSignedUrlAction(filePath)
    setLoading(false)
    if (res.ok && res.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={loading}
      className="text-xs font-medium text-[#2563EB] hover:underline flex items-center gap-1.5 disabled:opacity-60"
    >
      <Paperclip size={13} />
      {loading ? 'Abriendo…' : fileName}
    </button>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function NuevoDocumentoModal({
  vehicles,
  drivers,
  onClose,
}: {
  vehicles: Vehicle[]
  drivers: Driver[]
  onClose: () => void
}) {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [category,       setCategory]       = useState<string>('SOAT')
  const [entityType,     setEntityType]     = useState<string>('VEHICULO')
  const [entityId,       setEntityId]       = useState<string>(PLACEHOLDER_ID)
  const [fileName,       setFileName]       = useState<string>('')
  const [expirationDate, setExpirationDate] = useState<string>('')
  const [notes,          setNotes]          = useState<string>('')
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const needsEntityId = entityType === 'VEHICULO' || entityType === 'CONDUCTOR'

  function handleEntityTypeChange(type: string) {
    setEntityType(type)
    // EMPRESA y OTRO no tienen selector propio → usar el UUID placeholder
    setEntityId(type === 'VEHICULO' || type === 'CONDUCTOR' ? '' : PLACEHOLDER_ID)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setSelectedFile(f)
    if (f && !fileName) {
      setFileName(f.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (needsEntityId && !entityId) { setError('Selecciona la entidad'); return }
    setLoading(true); setError('')

    const fd = new FormData()
    fd.append('category',        category)
    fd.append('entity_type',     entityType)
    fd.append('entity_id',       entityId)
    fd.append('file_name',       fileName)
    fd.append('expiration_date', expirationDate)
    fd.append('notes',           notes)
    if (selectedFile) fd.append('file', selectedFile)

    const result = await crearDocumentoAction(fd)
    if (!result.ok) { setError(result.error ?? 'Error al guardar'); setLoading(false); return }

    router.refresh()
    onClose()
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Registrar documento</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Category + Entity type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Categoría *</label>
              <select value={category} onChange={e => setCategory(e.target.value)} required className={inputCls}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Entidad *</label>
              <select
                value={entityType}
                onChange={e => handleEntityTypeChange(e.target.value)}
                required
                className={inputCls}
              >
                {ENTITY_TYPES.map(t => (
                  <option key={t} value={t}>{ENTITY_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic entity selector */}
          {entityType === 'VEHICULO' && (
            <div>
              <label className={labelCls}>Vehículo *</label>
              <select value={entityId} onChange={e => setEntityId(e.target.value)} required className={inputCls}>
                <option value="">Seleccionar vehículo...</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.plate}</option>
                ))}
              </select>
            </div>
          )}

          {entityType === 'CONDUCTOR' && (
            <div>
              <label className={labelCls}>Conductor *</label>
              <select value={entityId} onChange={e => setEntityId(e.target.value)} required className={inputCls}>
                <option value="">Seleccionar conductor...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* File name */}
          <div>
            <label className={labelCls}>Nombre del documento *</label>
            <input
              type="text"
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              required
              placeholder="Ej: SOAT Camión ABC-123"
              className={inputCls}
            />
          </div>

          {/* Expiration date */}
          <div>
            <label className={labelCls}>Fecha de vencimiento</label>
            <input
              type="date"
              value={expirationDate}
              onChange={e => setExpirationDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones opcionales..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* File upload */}
          <div>
            <label className={labelCls}>Archivo (opcional)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              {selectedFile ? (
                <div className="flex items-center gap-2 text-sm text-[#0F172A]">
                  <Paperclip size={14} className="text-[#2563EB]" />
                  <span className="font-medium truncate">{selectedFile.name}</span>
                  <span className="text-[#64748B] text-xs ml-auto shrink-0">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-[#94A3B8]">
                  <Paperclip size={20} />
                  <span className="text-xs">Haz clic para subir archivo</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                name="file"
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Guardando...' : 'Guardar documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditDocumentoModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const router = useRouter()
  const [expirationDate, setExpirationDate] = useState(doc.expiration_date ?? '')
  const [notes,          setNotes]          = useState(doc.notes ?? '')
  const [loading,        setLoading]        = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = await actualizarDocumentoAction(doc.id, {
      expiration_date: expirationDate || null,
      notes: notes.trim() || null,
    })
    if (result.ok) { router.refresh(); onClose() }
    else setLoading(false)
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0F172A]">Editar documento</h3>
          <button onClick={onClose}><X size={16} className="text-[#64748B]" /></button>
        </div>
        <p className="text-xs text-[#64748B]">{doc.file_name}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Fecha de vencimiento</label>
            <input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Observaciones..."
              className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
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
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteButton({ id, filePath, fileName }: { id: string; filePath: string | null; fileName: string }) {
  const router   = useRouter()
  const [open,   setOpen]   = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    const result = await eliminarDocumentoAction(id, filePath)
    if (result.ok) { router.refresh(); setOpen(false) }
    else            setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[#94A3B8] hover:text-red-500 transition-colors p-1"
        title="Eliminar"
      >
        <Trash2 size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#0F172A]">¿Eliminar documento?</h3>
            <p className="text-sm text-[#64748B]">
              Se eliminará <span className="font-medium text-[#0F172A]">{fileName}</span> de forma permanente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function DocumentosClient({
  vehicles,
  drivers,
  documents,
}: {
  vehicles: Vehicle[]
  drivers: Driver[]
  documents: DocumentRow[]
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null)

  // Group by category in display order
  const ORDER = ['SOAT', 'TECNOMECANICA', 'POLIZA', 'CONTRATO', 'LICENCIA', 'RUT', 'OTRO']
  const grouped = ORDER.reduce<Record<string, DocumentRow[]>>((acc, cat) => {
    const docs = documents.filter(d => d.category === cat)
    if (docs.length > 0) acc[cat] = docs
    return acc
  }, {})

  // Counts for summary
  const redCount    = documents.filter(d => getAlertLevel(d.daysLeft) === 'red').length
  const yellowCount = documents.filter(d => getAlertLevel(d.daysLeft) === 'yellow').length

  const CATEGORY_COLORS: Record<string, string> = {
    SOAT:          'bg-blue-100 text-blue-700',
    TECNOMECANICA: 'bg-purple-100 text-purple-700',
    POLIZA:        'bg-indigo-100 text-indigo-700',
    CONTRATO:      'bg-teal-100 text-teal-700',
    LICENCIA:      'bg-cyan-100 text-cyan-700',
    RUT:           'bg-gray-100 text-gray-600',
    OTRO:          'bg-slate-100 text-slate-600',
  }

  const LEFT_BORDER: Record<string, string> = {
    red:    'border-l-4 border-l-red-400',
    yellow: 'border-l-4 border-l-yellow-400',
    green:  '',
    none:   '',
  }

  return (
    <>
      {modalOpen && (
        <NuevoDocumentoModal
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editDoc && <EditDocumentoModal doc={editDoc} onClose={() => setEditDoc(null)} />}

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Documentos</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{documents.length} documentos registrados</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Registrar documento
        </button>
      </div>

      {/* Alert summary */}
      {(redCount > 0 || yellowCount > 0) && (
        <div className="flex gap-3">
          {redCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-sm font-medium text-red-700">
                {redCount} documento{redCount !== 1 ? 's' : ''} vencido{redCount !== 1 ? 's' : ''} o urgente{redCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {yellowCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
              <span className="text-sm font-medium text-yellow-700">
                {yellowCount} próximo{yellowCount !== 1 ? 's' : ''} a vencer
              </span>
            </div>
          )}
        </div>
      )}

      {/* Document list grouped by category */}
      {documents.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl py-16 text-center">
          <FileText size={36} className="text-[#CBD5E1] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#64748B]">No hay documentos registrados</p>
          <p className="text-xs text-[#94A3B8] mt-1">Registra el primero con el botón de arriba</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, docs]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
                <span className="text-xs text-[#94A3B8]">{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Documento</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Entidad</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Vencimiento</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Notas</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {docs.map(doc => {
                      const alert  = getAlertLevel(doc.daysLeft)
                      const badge  = expiryBadge(doc.daysLeft)
                      const border = LEFT_BORDER[alert] ?? ''
                      return (
                        <tr key={doc.id} className={`hover:bg-[#F8FAFC] transition-colors ${border}`}>
                          <td className="px-3 py-2">
                            {doc.file_path ? (
                              <OpenFileButton filePath={doc.file_path} fileName={doc.file_name} />
                            ) : (
                              <span className="text-xs font-medium text-[#0F172A] flex items-center gap-1.5">
                                <FileText size={13} className="text-[#94A3B8]" />
                                {doc.file_name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs text-[#64748B]">{ENTITY_LABELS[doc.entity_type] ?? doc.entity_type}</div>
                            {doc.entityName && (
                              <div className="text-xs font-medium text-[#0F172A]">{doc.entityName}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {doc.expiration_date && (
                              <div className="text-xs text-[#94A3B8] mt-1">
                                {new Date(doc.expiration_date + 'T00:00:00').toLocaleDateString('es-CO')}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#64748B] max-w-[160px] truncate">
                            {doc.notes ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setEditDoc(doc)}
                                className="text-[#94A3B8] hover:text-[#2563EB] transition-colors p-1">
                                <Pencil size={13} />
                              </button>
                              <DeleteButton id={doc.id} filePath={doc.file_path} fileName={doc.file_name} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
