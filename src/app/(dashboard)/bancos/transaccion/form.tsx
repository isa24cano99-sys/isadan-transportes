'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, X } from 'lucide-react'
import { crearTransaccionAction, obtenerClienteViajeAction } from './actions'
import CategorySelector from '@/components/CategorySelector'
import SupplierSelector from '@/components/SupplierSelector'
import { formatTripOption, tripMatchesQuery } from '@/lib/utils'
import type { Trip } from '@/lib/types'
import {
  sugerirCategoriaAction,
  type TransactionCategory,
  type SugerirResult,
} from '@/app/(dashboard)/bancos/category-actions'

function SourceBadge({ source }: { source: SugerirResult['source'] }) {
  if (source === 'RULES')
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Regla</span>
  if (source === 'PROVEEDOR')
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Proveedor</span>
  return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">Historial</span>
}
import type { PucAccount } from '@/components/PucSelector'

export default function TransaccionForm({
  accounts,
  categories,
  pucAccounts,
  trips,
  defaultAccountId,
  onClose,
  onSuccess,
}: {
  accounts: { id: string; bank_name: string }[]
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  trips: Trip[]
  defaultAccountId?: string
  onClose?: () => void
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [categoryId,   setCategoryId]   = useState('')
  const [tripId,       setTripId]       = useState('')
  const [tripSearch,   setTripSearch]   = useState('')
  const [description,  setDescription]  = useState('')
  const [supplierNit,  setSupplierNit]  = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierTerceroId, setSupplierTerceroId] = useState<string | null>(null)
  const [suggestion,   setSuggestion]   = useState<SugerirResult | null>(null)
  const [tripClientSug, setTripClientSug] = useState<{ nit: string; name: string; terceroId: string | null } | null>(null)
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supplierNitRef = useRef('')
  supplierNitRef.current = supplierNit

  const selectedTrip = trips.find(t => t.id === tripId) ?? null

  const handleDescChange = useCallback((val: string) => {
    setDescription(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 4) { setSuggestion(null); return }
    debounceRef.current = setTimeout(async () => {
      const s = await sugerirCategoriaAction(val)
      setSuggestion(s)
      // Solo autollena si NO hay tercero elegido (supplierNitRef vacío) → el
      // SupplierSelector siempre gana. Arrastra el tercero_id del patrón (ya poblado),
      // sin re-resolver por NIT — mismo principio que el selector.
      if (s?.supplierName && !supplierNitRef.current) {
        setSupplierNit(s.supplierNit ?? '')
        setSupplierName(s.supplierName ?? '')
        setSupplierTerceroId(s.terceroId ?? null)
      }
    }, 400)
  }, [])

  const acceptSuggestion = () => {
    if (!suggestion) return
    setCategoryId(suggestion.categoryId)
    setSuggestion(null)
  }

  // Al elegir viaje, buscar su cliente para sugerir el tercero (si está vacío).
  const handleTripChange = async (id: string) => {
    setTripId(id)
    setTripClientSug(null)
    if (!id) return
    const c = await obtenerClienteViajeAction(id)
    if (c && (c.name || c.nit)) setTripClientSug({ nit: c.nit ?? '', name: c.name ?? '', terceroId: c.terceroId })
  }

  const handleCancel = () => {
    if (onClose) onClose()
    else router.back()
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!categoryId) { setError('Selecciona una categoría'); return }
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    fd.set('category_id',   categoryId)
    fd.set('description',   description)
    fd.set('supplier_nit',  supplierNit)
    fd.set('supplier_name', supplierName)
    fd.set('tercero_id',    supplierTerceroId ?? '')
    if (tripId) {
      fd.set('reference_type', 'TRIP')
      fd.set('reference_id',   tripId)
    }

    const result = await crearTransaccionAction(fd)
    if (result.ok) {
      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/bancos')
        router.refresh()
      }
    } else {
      setError(result.error ?? 'Error al registrar')
      setLoading(false)
    }
  }

  const inputCls    = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls    = 'block text-xs font-semibold text-[#64748B] mb-1.5'
  const readonlyCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#64748B] bg-[#F8FAFC] outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Account — hidden when pre-selected, selector when standalone */}
      {defaultAccountId ? (
        <input type="hidden" name="account_id" value={defaultAccountId} />
      ) : (
        <div>
          <label className={labelCls}>Cuenta bancaria *</label>
          <select name="account_id" required className={inputCls}>
            <option value="">Seleccionar cuenta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}</option>)}
          </select>
        </div>
      )}

      {/* Tipo */}
      <div>
        <label className={labelCls}>Tipo *</label>
        <select name="type" required className={inputCls}>
          <option value="">Seleccionar</option>
          <option value="INGRESO">Ingreso</option>
          <option value="EGRESO">Egreso</option>
        </select>
      </div>

      {/* Fecha */}
      <div>
        <label className={labelCls}>Fecha *</label>
        <input name="date" required type="date" className={inputCls} />
      </div>

      {/* Descripción + sugerencia */}
      <div>
        <label className={labelCls}>Descripción *</label>
        <textarea
          required
          rows={2}
          value={description}
          onChange={e => handleDescChange(e.target.value)}
          placeholder="Descripción de la transacción..."
          className={`${inputCls} resize-none`}
        />
        {suggestion && (
          <div className="mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Zap size={12} className="text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700 flex-1">
              Sugerido: <span className="font-semibold">{suggestion.categoryName}</span>
              {' '}<SourceBadge source={suggestion.source} />
              {suggestion.supplierName && (
                <span className="ml-1 text-blue-400 text-[10px]">· {suggestion.supplierName}</span>
              )}
            </span>
            <button type="button" onClick={acceptSuggestion}
              className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-medium hover:bg-blue-700 shrink-0">
              Usar
            </button>
            <button type="button" onClick={() => setSuggestion(null)}>
              <X size={12} className="text-blue-400 hover:text-blue-600" />
            </button>
          </div>
        )}
      </div>

      {/* Categoría */}
      <div>
        <label className={labelCls}>Categoría *</label>
        <CategorySelector
          value={categoryId}
          onChange={setCategoryId}
          categories={categories}
          pucAccounts={pucAccounts}
          typeFilter={suggestion?.categoryType}
        />
      </div>

      {/* Proveedor */}
      <div>
        <label className={labelCls}>Tercero (opcional)</label>
        <SupplierSelector
          nit={supplierNit}
          name={supplierName}
          onChange={(nit, name, terceroId) => { setSupplierNit(nit); setSupplierName(name); setSupplierTerceroId(terceroId); setTripClientSug(null) }}
        />
        {tripClientSug && !supplierNit && !supplierName && (
          <div className="mt-2 flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
            <span className="text-blue-800 min-w-0 truncate">
              Sugerido del viaje: <span className="font-semibold">{tripClientSug.name || tripClientSug.nit}</span>
            </span>
            <button type="button"
              onClick={() => { setSupplierNit(tripClientSug.nit); setSupplierName(tripClientSug.name); setSupplierTerceroId(tripClientSug.terceroId); setTripClientSug(null) }}
              className="ml-auto shrink-0 text-blue-700 hover:text-blue-900 font-semibold">
              Aceptar
            </button>
            <button type="button" onClick={() => setTripClientSug(null)}
              className="shrink-0 text-[#94A3B8] hover:text-[#64748B]">
              Ignorar
            </button>
          </div>
        )}
      </div>

      {/* Monto */}
      <div>
        <label className={labelCls}>Monto (COP) *</label>
        <input name="amount" required type="number" min="0.01" step="0.01" placeholder="0.00" className={inputCls} />
      </div>

      {/* Viaje asociado */}
      {trips.length > 0 && (
        <div>
          <label className={labelCls}>Viaje asociado (opcional)</label>
          <input
            type="text"
            value={tripSearch}
            onChange={e => setTripSearch(e.target.value)}
            placeholder="Buscar por manifiesto, placa o ruta…"
            className={`${inputCls} mb-2`}
          />
          <select value={tripId} onChange={e => handleTripChange(e.target.value)} className={inputCls}>
            <option value="">Sin viaje asociado</option>
            {trips.filter(t => tripMatchesQuery(t, tripSearch)).map(t => (
              <option key={t.id} value={t.id}>{formatTripOption(t)}</option>
            ))}
          </select>
          {selectedTrip && (
            <div className="mt-2">
              <label className="block text-xs text-[#64748B] mb-1">Placa del vehículo</label>
              <input readOnly value={selectedTrip.vehicles?.plate ?? '—'} className={readonlyCls} />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={handleCancel}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {loading ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}
