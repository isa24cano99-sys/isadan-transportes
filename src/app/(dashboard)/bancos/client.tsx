'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { Plus, ArrowDownCircle, ArrowUpCircle, Landmark } from 'lucide-react'

interface AccountWithBalance {
  id: string
  bank_name: string
  account_number: string | null
  initial_balance: number
  ingresos: number
  egresos: number
  balance: number
}

export default function BancosClient({ accounts }: { accounts: AccountWithBalance[] }) {
  const router = useRouter()
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalIngresos = accounts.reduce((s, a) => s + a.ingresos, 0)
  const totalEgresos = accounts.reduce((s, a) => s + a.egresos, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Bancos</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/bancos/transaccion"
            className="flex items-center gap-2 border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} /> Nueva transacción
          </Link>
          <Link
            href="/bancos/nueva-cuenta"
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} /> Nueva cuenta
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Saldo total</p>
          <p className="text-xl font-semibold text-[#0F172A]">{formatCOP(totalBalance)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownCircle size={13} className="text-green-500" />
            <p className="text-xs font-semibold text-[#64748B]">Total ingresos</p>
          </div>
          <p className="text-xl font-semibold text-green-600">{formatCOP(totalIngresos)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpCircle size={13} className="text-red-400" />
            <p className="text-xs font-semibold text-[#64748B]">Total egresos</p>
          </div>
          <p className="text-xl font-semibold text-red-500">{formatCOP(totalEgresos)}</p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Cuenta</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Número</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Saldo inicial</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Ingresos</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Egresos</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Saldo actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-sm text-[#64748B]">
                  <Landmark size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                  No hay cuentas bancarias registradas
                </td>
              </tr>
            ) : (
              accounts.map(a => (
                <tr key={a.id} className="hover:bg-[#F8FAFC] transition-colors cursor-pointer" onClick={() => router.push(`/bancos/${a.id}`)}>
                  <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{a.bank_name}</td>
                  <td className="px-4 py-3 text-sm text-[#64748B]">{a.account_number ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-[#64748B] text-right">{formatCOP(a.initial_balance)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{formatCOP(a.ingresos)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-red-500 text-right">{formatCOP(a.egresos)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A] text-right">{formatCOP(a.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
