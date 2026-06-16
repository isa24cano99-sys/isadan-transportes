'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearTransaccionAction } from './actions'
import { PREDEFINED } from '@/lib/categories'

type CustomCategory = { id: string; name: string; type: string }

export default function TransaccionForm({
  accounts,
  customCategories,
}: {
  accounts: { id: string; bank_name: string }[]
  customCategories: CustomCategory[]
}) {
  const router    = useRouter()
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [category,   setCategory]   = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState<'NEGOCIO' | 'CASA'>('NEGOCIO')

  const isNew = category === '__nueva__'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isNew && !newCatName.trim()) {
      setError('Escribe el nombre de la nueva categoría')
      return
    }
    setLoading(true); setError('')

    const fd = new FormData(e.currentTarget)
    if (isNew) {
      fd.set('category',          newCatName.trim())
      fd.set('new_category_name', newCatName.trim())
      fd.set('new_category_type', newCatType)
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

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  const negocioPred = PREDEFINED.filter(c => c.type === 'NEGOCIO' && c.value !== 'OTRO')
  const casaPred    = PREDEFINED.filter(c => c.type === 'CASA')
  const customNeg   = customCategories.filter(c => c.type === 'NEGOCIO')
  const customCasa  = customCategories.filter(c => c.type === 'CASA')

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">

      <div>
        <label className={labelCls}>Cuenta bancaria *</label>
        <select name="account_id" required className={inputCls}>
          <option value="">Seleccionar cuenta</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.bank_name}</option>
          ))}
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
          <input name="amount" required type="number" min="1" step="1" placeholder="0" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Fecha *</label>
        <input name="date" required type="date" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Categoría *</label>
        <select
          name="category"
          value={category}
          onChange={e => setCategory(e.target.value)}
          required={!isNew}
          className={inputCls}
        >
          <option value="">Seleccionar categoría</option>

          <optgroup label="Negocio">
            {negocioPred.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            {customNeg.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </optgroup>

          <optgroup label="Casa">
            {casaPred.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            {customCasa.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </optgroup>

          <option value="__nueva__">+ Nueva categoría...</option>
        </select>

        {isNew && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Nombre de la categoría"
              className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <select
              value={newCatType}
              onChange={e => setNewCatType(e.target.value as 'NEGOCIO' | 'CASA')}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="NEGOCIO">Negocio</option>
              <option value="CASA">Casa</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Descripción *</label>
        <textarea
          name="description"
          required
          rows={3}
          placeholder="Descripción de la transacción..."
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}
