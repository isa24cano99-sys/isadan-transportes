'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoCuotaAction } from './actions'
import { formatCOP, formatDate } from '@/lib/utils'
import { X } from 'lucide-react'

type Installment = {
  id: string
  installment_number: number
  due_date: string
  capital: number
  interest: number
  payment_amount: number
  remaining_balance: number
  status: string
  abonoExtra?: number
}

export function InstallmentsTable({
  installments,
  loanId,
}: {
  installments: Installment[]
  loanId: string
}) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError]         = useState('')
  // Modal para pedir la fecha al marcar una cuota como pagada
  const [markTarget, setMarkTarget] = useState<{ id: string; date: string } | null>(null)

  const nextPending = installments.find(i => i.status === 'PENDIENTE')

  const setEstado = async (id: string, status: 'PAGADA' | 'PENDIENTE', paidDate: string | null) => {
    setLoadingId(id)
    setError('')
    const res = await actualizarEstadoCuotaAction(id, loanId, status, paidDate)
    if (!res.ok) setError(res.error ?? 'Error al actualizar la cuota')
    else router.refresh()
    setLoadingId(null)
  }

  const handleToggle = (inst: Installment) => {
    if (inst.status === 'PAGADA') {
      // Desmarcar → PENDIENTE + limpiar fecha
      void setEstado(inst.id, 'PENDIENTE', null)
    } else {
      // Marcar → pedir fecha de pago
      setMarkTarget({ id: inst.id, date: new Date().toISOString().split('T')[0] })
    }
  }

  const confirmMark = async () => {
    if (!markTarget) return
    await setEstado(markTarget.id, 'PAGADA', markTarget.date)
    setMarkTarget(null)
  }

  return (
    <div>
      {error && <p className="text-sm text-red-500 font-medium mb-3">{error}</p>}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Vencimiento</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Cuota</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Abono extra</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Capital</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Interés</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Saldo</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {installments.map(inst => {
              const isPagada  = inst.status === 'PAGADA'
              const isNext    = inst.id === nextPending?.id
              const abono     = inst.abonoExtra ?? 0

              return (
                <tr
                  key={inst.id}
                  className={`transition-colors ${
                    isPagada ? 'bg-green-50' : isNext ? 'bg-yellow-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-center text-xs font-mono text-[#64748B]">
                    {inst.installment_number}
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{formatDate(inst.due_date)}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#0F172A]">
                    {formatCOP(inst.payment_amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {abono > 0 ? (
                      <span className="inline-block bg-blue-50 text-[#2563EB] font-bold px-2 py-0.5 rounded">
                        {formatCOP(abono)}
                      </span>
                    ) : (
                      <span className="text-[#CBD5E1]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[#0F172A]">{formatCOP(inst.capital)}</td>
                  <td className="px-4 py-3 text-right text-[#64748B]">{formatCOP(inst.interest)}</td>
                  <td className="px-4 py-3 text-right text-[#0F172A]">
                    {formatCOP(inst.remaining_balance)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="checkbox"
                        checked={isPagada}
                        disabled={loadingId === inst.id}
                        onChange={() => handleToggle(inst)}
                        title={isPagada ? 'Desmarcar (volver a pendiente)' : 'Marcar como pagada'}
                        className="w-4 h-4 rounded border-[#CBD5E1] text-green-600 focus:ring-green-500 cursor-pointer disabled:opacity-40"
                      />
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                        isPagada ? 'bg-green-100 text-green-700'
                                 : isNext ? 'bg-yellow-100 text-yellow-700'
                                 : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isPagada ? 'Pagada' : isNext ? 'Próxima' : 'Pendiente'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: fecha de pago al marcar una cuota como pagada */}
      {markTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMarkTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Marcar cuota como pagada</h3>
              <button onClick={() => setMarkTarget(null)}><X size={16} className="text-[#64748B]" /></button>
            </div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha de pago</label>
            <input
              type="date"
              value={markTarget.date}
              onChange={e => setMarkTarget(t => t && { ...t, date: e.target.value })}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <div className="flex gap-2 pt-4">
              <button onClick={() => setMarkTarget(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={confirmMark} disabled={loadingId === markTarget.id || !markTarget.date}
                className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {loadingId === markTarget.id ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
