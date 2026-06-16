'use client'

import { useState } from 'react'
import { pagarCuotaAction } from '../actions'
import { formatCOP, formatDate } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'

type Installment = {
  id: string
  installment_number: number
  due_date: string
  capital: number
  interest: number
  payment_amount: number
  remaining_balance: number
  status: string
}

export function InstallmentsTable({
  installments,
  loanId,
}: {
  installments: Installment[]
  loanId: string
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError]         = useState('')

  const nextPending = installments.find(i => i.status === 'PENDIENTE')

  const handlePay = async (id: string) => {
    setLoadingId(id)
    setError('')
    const result = await pagarCuotaAction(id)
    if (!result.ok) setError(result.error ?? 'Error al marcar la cuota')
    setLoadingId(null)
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
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Capital</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Interés</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Saldo</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {installments.map(inst => {
              const isPagada = inst.status === 'PAGADA'
              const isNext   = inst.id === nextPending?.id

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
                  <td className="px-4 py-3 text-right text-[#0F172A]">{formatCOP(inst.capital)}</td>
                  <td className="px-4 py-3 text-right text-[#64748B]">{formatCOP(inst.interest)}</td>
                  <td className="px-4 py-3 text-right text-[#0F172A]">
                    {formatCOP(inst.remaining_balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isPagada ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                        <CheckCircle2 size={10} />
                        Pagada
                      </span>
                    ) : isNext ? (
                      <button
                        onClick={() => handlePay(inst.id)}
                        disabled={loadingId === inst.id}
                        className="text-[10px] font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {loadingId === inst.id ? 'Pagando...' : 'Marcar pagada'}
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                        Pendiente
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
