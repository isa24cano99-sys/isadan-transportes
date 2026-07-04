'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearCuentaBancariaAction } from './actions'

export default function NuevaCuentaForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await crearCuentaBancariaAction(formData)
    if (result.ok) {
      router.push('/bancos')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al crear la cuenta')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Nombre de la cuenta *</label>
        <input
          name="bank_name"
          required
          placeholder="Bancolombia Corriente"
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Número de cuenta</label>
        <input
          name="account_number"
          placeholder="123-456789-01"
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Saldo inicial (COP) *</label>
        <input
          name="initial_balance"
          required
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          defaultValue="0"
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
          {loading ? 'Guardando...' : 'Crear cuenta'}
        </button>
      </div>
    </form>
  )
}
