'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearPrestamoAction } from './actions'
import { formatCOP } from '@/lib/utils'

function num(v: string) { return parseFloat(v) || 0 }

/** Cuota de amortización francesa. `ratePct` = tasa mensual en %. */
function calcCuota(amount: number, ratePct: number, term: number): number {
  if (!amount || !ratePct || !term) return 0
  const r      = ratePct / 100
  const factor = Math.pow(1 + r, term)
  return (amount * r * factor) / (factor - 1)
}

/**
 * Despeja la tasa mensual (decimal) de la fórmula de amortización francesa
 * cuota = monto · i·(1+i)^n / ((1+i)^n − 1), por bisección.
 * Devuelve 0 si la cuota es insuficiente (≤ monto/n → no hay tasa positiva).
 */
function solveMonthlyRate(amount: number, cuota: number, n: number): number {
  if (!amount || !cuota || !n) return 0
  if (cuota <= amount / n) return 0
  const pay = (i: number) =>
    i === 0 ? amount / n : (amount * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
  let lo = 0, hi = 1, guard = 0
  while (pay(hi) < cuota && guard++ < 80) hi *= 2      // asegura pay(hi) ≥ cuota
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (pay(mid) < cuota) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

type Modo = 'tasa' | 'cuota'

export default function NuevoPrestamoForm() {
  const router = useRouter()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [modo, setModo]         = useState<Modo>('tasa')
  const [entity, setEntity]     = useState('')
  const [amount, setAmount]     = useState('')
  const [annualRate, setAnnualRate] = useState('') // modo 'tasa'
  const [cuotaInput, setCuotaInput] = useState('') // modo 'cuota'
  const [term, setTerm]         = useState('')
  const [startDate, setStartDate] = useState('')

  const amountN = num(amount)
  const termN   = num(term)

  // ── Cálculo unificado según el modo ──────────────────────────────────────
  let monthlyRatePct = 0, annualRatePct = 0, cuota = 0
  if (modo === 'tasa') {
    // Tasa mensual efectiva: (1 + anual)^(1/12) − 1
    monthlyRatePct = annualRate ? (Math.pow(1 + num(annualRate) / 100, 1 / 12) - 1) * 100 : 0
    annualRatePct  = num(annualRate)
    cuota          = calcCuota(amountN, monthlyRatePct, termN)
  } else {
    const i = solveMonthlyRate(amountN, num(cuotaInput), termN) // decimal mensual
    monthlyRatePct = i * 100
    annualRatePct  = i > 0 ? (Math.pow(1 + i, 12) - 1) * 100 : 0
    cuota          = num(cuotaInput)
  }

  const totalPagar     = cuota * termN
  const totalIntereses = totalPagar - amountN
  const cuotaInsuf     = modo === 'cuota' && num(cuotaInput) > 0 && amountN > 0 && termN > 0 && monthlyRatePct <= 0
  const puedeMostrar   = amountN > 0 && termN > 0 && cuota > 0 && monthlyRatePct > 0

  const cambiarModo = (m: Modo) => {
    if (m === modo) return
    setModo(m)
    setAnnualRate('')   // limpiar campos calculados al cambiar de modo
    setCuotaInput('')
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!puedeMostrar) {
      setError(cuotaInsuf
        ? 'La cuota es demasiado baja para el monto y plazo (no da una tasa positiva).'
        : 'Completa los datos para calcular la cuota y la tasa.')
      return
    }
    setLoading(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    fd.set('interest_rate', monthlyRatePct.toFixed(6)) // la action espera la tasa MENSUAL en %
    const result = await crearPrestamoAction(fd)
    if (result.ok) {
      router.push(result.id ? `/prestamos/${result.id}` : '/prestamos')
      router.refresh()
    } else {
      setError(result.error ?? 'Error al guardar')
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Datos del préstamo</h2>

        {/* Toggle de modo de cálculo */}
        <div className="mb-5">
          <span className={labelCls}>Modo de cálculo</span>
          <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden">
            {([
              ['tasa',  'Conozco la tasa de interés'],
              ['cuota', 'Conozco la cuota mensual'],
            ] as const).map(([m, label], i) => (
              <button
                key={m}
                type="button"
                onClick={() => cambiarModo(m)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-[#E2E8F0]' : ''} ${
                  modo === m ? 'bg-[#2563EB] text-white' : 'bg-white text-[#64748B] hover:bg-[#F1F5F9]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Entidad (banco o persona) *</label>
            <input name="entity" type="text" value={entity} onChange={e => setEntity(e.target.value)}
              placeholder="Ej: Bancolombia, Juan Pérez..." required className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Monto del préstamo (COP) *</label>
            <input name="amount" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" required className={inputCls} />
          </div>

          {modo === 'tasa' ? (
            <div>
              <label className={labelCls}>Tasa de interés anual (%) *</label>
              <input type="number" min="0.01" step="0.01" value={annualRate} onChange={e => setAnnualRate(e.target.value)}
                placeholder="Ej: 18" required className={inputCls} />
              {monthlyRatePct > 0 && (
                <p className="text-xs text-[#64748B] mt-1">
                  Equivale a <span className="font-semibold text-[#2563EB]">{monthlyRatePct.toFixed(4)}% mensual</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className={labelCls}>Cuota mensual fija (COP) *</label>
              <input type="number" min="1" step="0.01" value={cuotaInput} onChange={e => setCuotaInput(e.target.value)}
                placeholder="0" required className={inputCls} />
              {monthlyRatePct > 0 ? (
                <p className="text-xs text-[#64748B] mt-1">
                  Tasa calculada: <span className="font-semibold text-[#2563EB]">{monthlyRatePct.toFixed(4)}% mensual</span>
                  {' · '}<span className="font-semibold text-[#2563EB]">{annualRatePct.toFixed(2)}% anual</span>
                </p>
              ) : cuotaInsuf ? (
                <p className="text-xs text-red-500 mt-1">La cuota es demasiado baja para el monto y plazo.</p>
              ) : null}
            </div>
          )}

          <div>
            <label className={labelCls}>Plazo (meses) *</label>
            <input name="term_months" type="number" min="1" max="360" value={term} onChange={e => setTerm(e.target.value)}
              placeholder="0" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fecha de inicio *</label>
            <input name="start_date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              required className={inputCls} />
          </div>
        </div>
      </div>

      {/* Resumen (siempre que se pueda calcular) */}
      {puedeMostrar && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Resumen del crédito</h2>
          <div className="space-y-2.5">
            <SummaryRow label="Monto del préstamo" value={formatCOP(amountN)} />
            <SummaryRow label="Tasa mensual" value={`${monthlyRatePct.toFixed(4)}%`} />
            <SummaryRow label="Tasa anual equivalente" value={`${annualRatePct.toFixed(2)}%`} />
            <SummaryRow label="Cuota mensual" value={formatCOP(cuota)} highlight />
            <SummaryRow label={`Total a pagar (${term} cuotas)`} value={formatCOP(totalPagar)} />
            <SummaryRow label="Total intereses" value={formatCOP(totalIntereses)} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
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
      <span className={`font-bold ${highlight ? 'text-[#2563EB] text-base' : 'text-sm text-[#0F172A]'}`}>{value}</span>
    </div>
  )
}
