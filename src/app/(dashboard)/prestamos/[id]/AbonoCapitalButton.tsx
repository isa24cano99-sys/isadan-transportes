'use client'

import { useState } from 'react'
import { X, Minus, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import { registrarPagoAction, type AbonoResumen } from './abono-actions'
import { formatCOP } from '@/lib/utils'

type Installment = {
  id: string
  installment_number: number
  due_date: string
  payment_amount: number
  capital: number
  interest: number
  remaining_balance: number
  status: 'PENDIENTE' | 'PAGADA' | 'VENCIDA'
}

type Step   = 'form' | 'diff' | 'result'
type Opcion = 'REDUCIR_CUOTA' | 'REDUCIR_PLAZO'

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA:    'Pagada',
  VENCIDA:   'Vencida',
}

export function AbonoCapitalButton({
  loanId,
  installments,
}: {
  loanId: string
  installments: Installment[]
}) {
  const [open,       setOpen]       = useState(false)
  const [step,       setStep]       = useState<Step>('form')
  const [selId,      setSelId]      = useState('')
  const [monto,      setMonto]      = useState('')
  const [fecha,      setFecha]      = useState('')
  const [applyExtra, setApplyExtra] = useState<boolean | null>(null)
  const [opcion,     setOpcion]     = useState<Opcion>('REDUCIR_CUOTA')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [resumen,    setResumen]    = useState<AbonoResumen | null>(null)
  const [hadExtra,   setHadExtra]   = useState(false)

  // Solo cuotas reales (los abonos a capital tienen installment_number < 1)
  const cuotas        = installments.filter(i => i.installment_number >= 1)
  const selectedInst  = cuotas.find(i => i.id === selId) ?? null
  const montoNum      = Number(monto) || 0
  const diff          = selectedInst ? montoNum - Number(selectedInst.payment_amount) : 0
  const extraCapital  = Math.max(0, diff)

  function openModal() {
    const first = cuotas.find(i => i.status !== 'PAGADA')
    setSelId(first?.id ?? '')
    setMonto(String(first?.payment_amount ?? ''))
    setFecha(new Date().toISOString().split('T')[0])
    setStep('form')
    setApplyExtra(null)
    setOpcion('REDUCIR_CUOTA')
    setError('')
    setResumen(null)
    setHadExtra(false)
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
  }

  function handleSelectInst(id: string) {
    setSelId(id)
    const inst = cuotas.find(i => i.id === id)
    if (inst) setMonto(String(inst.payment_amount))
  }

  function handleContinue() {
    if (!selId)               { setError('Selecciona una cuota'); return }
    if (montoNum <= 0)        { setError('Ingresa un monto válido'); return }
    if (!fecha)               { setError('Ingresa la fecha del abono'); return }
    if (!selectedInst)        { return }
    setError('')

    if (montoNum === Number(selectedInst.payment_amount)) {
      // Monto exacto → aplicar directamente sin pasar por 'diff'
      void handleApply(false, undefined)
    } else {
      setStep('diff')
    }
  }

  function handleConfirmDiff() {
    if (diff > 0 && applyExtra === null) { setError('Elige una opción'); return }
    setError('')
    void handleApply(applyExtra === true, opcion)
  }

  async function handleApply(withExtra: boolean, op: Opcion | undefined) {
    setLoading(true)
    setError('')
    const res = await registrarPagoAction(loanId, selId, montoNum, fecha, withExtra, op)
    if (res.ok) {
      setResumen(res.resumen ?? null)
      setHadExtra(res.hadExtraordinary)
      setStep('result')
    } else {
      setError(res.error ?? 'Error al registrar el pago')
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB] text-xs font-medium px-3 py-2 rounded-lg transition-colors"
      >
        <Minus size={13} />
        Registrar pago
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-sm font-semibold text-[#0F172A]">
                {step === 'result' ? 'Pago registrado' : 'Registrar pago de cuota'}
              </h2>
              <button onClick={closeModal}>
                <X size={18} className="text-[#64748B] hover:text-[#0F172A]" />
              </button>
            </div>

            {/* ── STEP FORM ── */}
            {step === 'form' && (
              <div className="p-6 space-y-4">

                {/* Selector de cuota */}
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">
                    Cuota *
                  </label>
                  <select
                    value={selId}
                    onChange={e => handleSelectInst(e.target.value)}
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Selecciona una cuota…</option>
                    {cuotas.map(inst => (
                      <option key={inst.id} value={inst.id} disabled={inst.status === 'PAGADA'}>
                        #{inst.installment_number} · {inst.due_date} · {formatCOP(inst.payment_amount)} · {STATUS_LABEL[inst.status]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Monto + fecha */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#64748B] mb-1.5">
                      Monto pagado (COP) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1000"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      placeholder="0"
                      className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#64748B] mb-1.5">
                      Fecha real del abono *
                    </label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                <div className="flex gap-3 pt-1">
                  <button onClick={closeModal}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleContinue} disabled={loading}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                    {loading ? 'Registrando…' : 'Continuar'}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP DIFF ── */}
            {step === 'diff' && selectedInst && (
              <div className="p-6 space-y-4">

                {/* Banner de advertencia */}
                <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-yellow-800">Diferencia detectada</p>
                    <p className="text-xs text-yellow-700">
                      El abono es de{' '}
                      <span className="font-semibold">{formatCOP(montoNum)}</span> pero la cuota es de{' '}
                      <span className="font-semibold">{formatCOP(selectedInst.payment_amount)}</span>
                      {diff > 0
                        ? ` — sobran ${formatCOP(diff)}.`
                        : ` — faltan ${formatCOP(Math.abs(diff))}.`}
                    </p>
                  </div>
                </div>

                {/* Solo si sobra capital: preguntar si aplicar extraordinario */}
                {diff > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[#0F172A]">
                      ¿Registrar{' '}
                      <span className="text-[#2563EB]">{formatCOP(extraCapital)}</span>{' '}
                      como abono extraordinario a capital?
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setApplyExtra(true)}
                        className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                          applyExtra === true
                            ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                            : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                        }`}>
                        Sí, aplicar
                      </button>
                      <button type="button" onClick={() => setApplyExtra(false)}
                        className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                          applyExtra === false
                            ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                            : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                        }`}>
                        No, solo marcar pagada
                      </button>
                    </div>

                    {applyExtra === true && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[#64748B]">Opción de recálculo</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button type="button" onClick={() => setOpcion('REDUCIR_CUOTA')}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                              opcion === 'REDUCIR_CUOTA' ? 'border-[#2563EB] bg-blue-50' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                            }`}>
                            <TrendingDown size={16} className={opcion === 'REDUCIR_CUOTA' ? 'text-[#2563EB]' : 'text-[#94A3B8]'} />
                            <span className={`text-xs font-semibold ${opcion === 'REDUCIR_CUOTA' ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                              Reducir cuota
                            </span>
                            <span className="text-[10px] text-[#94A3B8] text-center leading-tight">
                              Mismo plazo,<br/>cuota más baja
                            </span>
                          </button>
                          <button type="button" onClick={() => setOpcion('REDUCIR_PLAZO')}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                              opcion === 'REDUCIR_PLAZO' ? 'border-[#2563EB] bg-blue-50' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                            }`}>
                            <TrendingUp size={16} className={opcion === 'REDUCIR_PLAZO' ? 'text-[#2563EB]' : 'text-[#94A3B8]'} />
                            <span className={`text-xs font-semibold ${opcion === 'REDUCIR_PLAZO' ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                              Reducir plazo
                            </span>
                            <span className="text-[10px] text-[#94A3B8] text-center leading-tight">
                              Misma cuota,<br/>termina antes
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setStep('form'); setApplyExtra(null); setError('') }}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
                    Volver
                  </button>
                  <button
                    onClick={handleConfirmDiff}
                    disabled={loading || (diff > 0 && applyExtra === null)}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                    {loading ? 'Registrando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP RESULT ── */}
            {step === 'result' && (
              <div className="p-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-green-700">
                    ✅ Pago registrado correctamente
                    {hadExtra && ' — tabla de amortización recalculada'}
                  </p>
                </div>

                {resumen && hadExtra && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#F8FAFC] rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Cuota anterior</p>
                        <p className="text-sm font-bold text-[#64748B] line-through">
                          {formatCOP(resumen.cuotaAnterior)}
                        </p>
                      </div>
                      <div className={`rounded-xl p-3 ${resumen.cuotaNueva < resumen.cuotaAnterior ? 'bg-green-50' : 'bg-[#F8FAFC]'}`}>
                        <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Cuota nueva</p>
                        <p className={`text-sm font-bold ${resumen.cuotaNueva === 0 || resumen.cuotaNueva < resumen.cuotaAnterior ? 'text-green-700' : 'text-[#0F172A]'}`}>
                          {resumen.cuotaNueva === 0 ? 'Deuda cancelada' : formatCOP(resumen.cuotaNueva)}
                        </p>
                      </div>
                      <div className="bg-[#F8FAFC] rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Cuotas restantes antes</p>
                        <p className="text-sm font-bold text-[#64748B] line-through">
                          {resumen.cuotasRestantesAntes}
                        </p>
                      </div>
                      <div className={`rounded-xl p-3 ${resumen.cuotasRestantesDespues < resumen.cuotasRestantesAntes ? 'bg-green-50' : 'bg-[#F8FAFC]'}`}>
                        <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Cuotas restantes nuevas</p>
                        <p className={`text-sm font-bold ${resumen.cuotasRestantesDespues < resumen.cuotasRestantesAntes ? 'text-green-700' : 'text-[#0F172A]'}`}>
                          {resumen.cuotasRestantesDespues}
                        </p>
                      </div>
                    </div>

                    {resumen.ahorroIntereses > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-[10px] uppercase tracking-wider text-blue-500 mb-1">Ahorro total en intereses</p>
                        <p className="text-lg font-bold text-blue-700">{formatCOP(resumen.ahorroIntereses)}</p>
                      </div>
                    )}
                  </>
                )}

                <button onClick={closeModal}
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-2.5 rounded-lg text-sm">
                  Cerrar
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  )
}
