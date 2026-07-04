'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, X } from 'lucide-react'
import { crearTransaccionAction } from './actions'
import CategorySelector from '@/components/CategorySelector'
import SupplierSelector from '@/components/SupplierSelector'
import {
  sugerirCategoriaAction,
  type TransactionCategory,
  type SugerirResult,
} from '@/app/(dashboard)/bancos/category-actions'
import type { PucAccount } from '@/components/PucSelector'

type Trip = {
  id: string
  trip_number: string
  origin: string
  destination: string
  load_date: string | null
  vehicles: { plate: string } | null
}

export default function TransaccionForm({
  accounts,
  categories,
  pucAccounts,
  trips,
}: {
  accounts: { id: string; bank_name: string }[]
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  trips: Trip[]
}) {
  const router = useRouter()
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [categoryId,   setCategoryId]   = useState('')
  const [tripId,       setTripId]       = useState('')
  const [description,  setDescription]  = useState('')
  const [supplierNit,  setSupplierNit]  = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [suggestion,   setSuggestion]   = useState<SugerirResult | null>(null)
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
      if (s?.supplierName && !supplierNitRef.current) {
        setSupplierNit(s.supplierNit ?? '')
        setSupplierName(s.supplierName ?? '')
      }
    }, 400)
  }, [])

  const acceptSuggestion = () => {
    if (!suggestion) return
    setCategoryId(suggestion.categoryId)
    setSuggestion(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!categoryId) { setError('Selecciona una categoría'); return }
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    fd.set('category_id',  categoryId)
    fd.set('description',  description)
    fd.set('supplier_nit', supplierNit)
    fd.set('supplier_name', supplierName)
    if (tripId) {
      fd.set('reference_type', 'TRIP')
      fd.set('reference_id',   tripId)
    }

    const result = await crearTransaccionAction(fd)
    if (result.ok) {
      router.push('/bancos')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al registrar')
      setLoading(false)
    }
  }

  const inputCls    = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls    = 'block text-xs font-semibold text-[#64748B] mb-1.5'
  const readonlyCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#64748B] bg-[#F8FAFC] outline-none'

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">

      <div>
        <label className={labelCls}>Cuenta bancaria *</label>
        <select name="account_id" required className={inputCls}>
          <option value="">Seleccionar cuenta</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Tipo *</label>
          <select name="type" required className={inputCls}>
            <option value="">Seleccionar</option>
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Monto (COP) *</label>
          <input name="amount" required type="number" min="0.01" step="0.01" placeholder="0.00" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Fecha *</label>
        <input name="date" required type="date" className={inputCls} />
      </div>

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

      <div>
        <label className={labelCls}>Proveedor (opcional)</label>
        <SupplierSelector
          nit={supplierNit}
          name={supplierName}
          onChange={(nit, name) => { setSupplierNit(nit); setSupplierName(name) }}
        />
      </div>

      {trips.length > 0 && (
        <div>
          <label className={labelCls}>Viaje asociado (opcional)</label>
          <select value={tripId} onChange={e => setTripId(e.target.value)} className={inputCls}>
            <option value="">Sin viaje asociado</option>
            {trips.map(t => {
              const fecha = t.load_date ? t.load_date.split('-').reverse().join('/') : '—'
              const placa = t.vehicles?.plate ?? '—'
              return (
                <option key={t.id} value={t.id}>
                  {t.trip_number} · {placa} · {t.origin} → {t.destination} · {fecha}
                </option>
              )
            })}
          </select>
          {selectedTrip && (
            <div className="mt-2">
              <label className="block text-xs text-[#64748B] mb-1">Placa del vehículo</label>
              <input readOnly value={selectedTrip.vehicles?.plate ?? '—'} className={readonlyCls} />
            </div>
          )}
        </div>
      )}

      <div>
        <label className={labelCls}>Descripción *</label>
        <textarea
          required
          rows={3}
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
              <span className="ml-1 text-blue-400">· {suggestion.categoryType === 'CASA' ? 'Casa' : 'Negocio'}</span>
            </span>
            <button type="button" onClick={acceptSuggestion}
              className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-medium hover:bg-blue-700 shrink-0">
              Aceptar
            </button>
            <button type="button" onClick={() => setSuggestion(null)}>
              <X size={12} className="text-blue-400 hover:text-blue-600" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
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
