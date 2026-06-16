'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, ReceiptText } from 'lucide-react'
import { PREDEFINED, getCategoryLabel, getCategoryType } from '@/lib/categories'

interface Account {
  id: string
  bank_name: string
  account_number: string | null
  initial_balance: number
}

interface Transaction {
  id: string
  account_id: string
  type: 'INGRESO' | 'EGRESO'
  amount: number
  date: string
  category: string
  description: string
}

type CustomCategory = { id: string; name: string; type: string }
type TipoFilter = 'TODOS' | 'NEGOCIO' | 'CASA'

interface Props {
  account: Account
  transactions: Transaction[]
  ingresos: number
  egresos: number
  balance: number
  customCategories: CustomCategory[]
}

export default function BankDetailClient({ account, transactions, ingresos, egresos, balance, customCategories }: Props) {
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [category,    setCategory]    = useState('')
  const [tipoFilter,  setTipoFilter]  = useState<TipoFilter>('TODOS')

  const filtered = useMemo(() => transactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo   && t.date > dateTo)   return false
    if (category && t.category !== category) return false
    if (tipoFilter !== 'TODOS') {
      const tipo = getCategoryType(t.category, customCategories)
      if (tipo !== tipoFilter) return false
    }
    return true
  }), [transactions, dateFrom, dateTo, category, tipoFilter, customCategories])

  const hasFilters = dateFrom || dateTo || category || tipoFilter !== 'TODOS'

  const negocioPred = PREDEFINED.filter(c => c.type === 'NEGOCIO' && c.value !== 'OTRO')
  const casaPred    = PREDEFINED.filter(c => c.type === 'CASA')
  const customNeg   = customCategories.filter(c => c.type === 'NEGOCIO')
  const customCasa  = customCategories.filter(c => c.type === 'CASA')

  const tipoBtn = (v: TipoFilter, label: string) => (
    <button
      onClick={() => setTipoFilter(v)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        tipoFilter === v
          ? 'bg-[#2563EB] text-white'
          : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/bancos"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[#0F172A]">{account.bank_name}</h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              {account.account_number ? `Cuenta ${account.account_number}` : 'Sin número de cuenta'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Saldo actual</p>
          <p className="text-xl font-semibold text-[#0F172A]">{formatCOP(balance)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownCircle size={13} className="text-green-500" />
            <p className="text-xs font-semibold text-[#64748B]">Total ingresos</p>
          </div>
          <p className="text-xl font-semibold text-green-600">{formatCOP(ingresos)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpCircle size={13} className="text-red-400" />
            <p className="text-xs font-semibold text-[#64748B]">Total egresos</p>
          </div>
          <p className="text-xl font-semibold text-red-500">{formatCOP(egresos)}</p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Todas</option>
              <optgroup label="Negocio">
                {negocioPred.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                {customNeg.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Casa">
                {casaPred.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                {customCasa.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </optgroup>
            </select>
          </div>
          {hasFilters && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setCategory(''); setTipoFilter('TODOS') }}
              className="text-xs text-[#64748B] hover:text-[#0F172A] underline transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#64748B] mr-1">Tipo:</span>
          {tipoBtn('TODOS',   'Todas')}
          {tipoBtn('NEGOCIO', 'Negocio')}
          {tipoBtn('CASA',    'Casa')}
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Fecha</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Categoría</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Descripción</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm text-[#64748B]">
                  <ReceiptText size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                  No hay transacciones{hasFilters ? ' con estos filtros' : ''}
                </td>
              </tr>
            ) : (
              filtered.map(t => {
                const catType = getCategoryType(t.category, customCategories)
                return (
                  <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#64748B]">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.type === 'INGRESO'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {t.type === 'INGRESO'
                          ? <ArrowDownCircle size={11} />
                          : <ArrowUpCircle size={11} />}
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      <div className="flex items-center gap-1.5">
                        {catType && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            catType === 'NEGOCIO'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}>
                            {catType === 'NEGOCIO' ? 'NEG' : 'CASA'}
                          </span>
                        )}
                        {getCategoryLabel(t.category, customCategories)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#0F172A]">{t.description}</td>
                    <td
                      className={`px-4 py-3 text-sm font-semibold text-right ${
                        t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {t.type === 'EGRESO' ? '−' : '+'}{formatCOP(Number(t.amount))}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
