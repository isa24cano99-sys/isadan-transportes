'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearPrestamoAction } from './actions'
import { formatCOP } from '@/lib/utils'

function num(v: string) { return parseFloat(v) || 0 }

function calcCuota(amount: number, rate: number, term: number): number {
  if (!amount || !rate || !term) return 0
  const r      = rate / 100
  const factor = Math.pow(1 + r, term)
  return (amount * r * factor) / (factor - 1)
}

export default function NuevoPrestamoForm() {
  const router = useRouter()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [entity, setEntity]     = useState('')
  const [amount, setAmount]     = useState('')
  const [rate, setRate]         = useState('')
  const [term, setTerm]         = useState('')
  const [startDate, setStartDate] = useState('')

  const cuota          = calcCuota(num(amount), num(rate), num(term))
  const totalPagar     = cuota * num(term)
  const totalIntereses = totalPagar - num(amount)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await crearPrestamoAction(new FormData(e.currentTarget))
    if (result.ok) {
      router.push(result.id ? `/prestamos/${result.id}` : '/prestamos')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al guardar')
      setLoading(false)
    }
  }

  const inputCls   = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls   = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Datos del préstamo</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Entidad (banco o persona) *</label>
            <input
              name="entity"
              type="text"
              value={entity}
              onChange={e => setEntity(e.target.value)}
              placeholder="Ej: Bancolombia, Juan Pérez..."
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Monto del préstamo (COP) *</label>
            <input
              name="amount"
              type="number"
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Tasa de interés mensual (%) *</label>
            <input
              name="interest_rate"
              type="number"
              min="0.01"
              step="0.001"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="0.000"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Plazo (meses) *</label>
            <input
              name="term_months"
              type="number"
              min="1"
              max="360"
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="0"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Fecha de inicio *</label>
            <input
              name="start_date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {cuota > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Resumen del crédito</h2>
          <div className="space-y-2.5">
            <SummaryRow label="Cuota mensual fija" value={formatCOP(cuota)} highlight />
            <SummaryRow label={`Total a pagar (${term} cuotas)`} value={formatCOP(totalPagar)} />
            <SummaryRow label="Total intereses" value={formatCOP(totalIntereses)} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3">
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
          {loading ? 'Guardando...' : 'Registrar préstamo'}
        </button>
      </div>
    </form>
  )
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#64748B]">{label}</span>
      <span className={`text-sm font-bold ${highlight ? 'text-[#2563EB] text-base' : 'text-[#0F172A]'}`}>{value}</span>
    </div>
  )
}
