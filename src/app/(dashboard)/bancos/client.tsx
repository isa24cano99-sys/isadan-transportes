'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { Plus, ArrowDownCircle, ArrowUpCircle, Landmark, Pencil, Trash2, X, GitMerge } from 'lucide-react'
import { actualizarCuentaAction, eliminarCuentaAction } from './actions'

interface AccountWithBalance {
  id: string
  bank_name: string
  account_number: string | null
  initial_balance: number
  ingresos: number
  egresos: number
  balance: number
}

type EditForm = { bank_name: string; account_number: string; initial_balance: string }

export default function BancosClient({ accounts: initial }: { accounts: AccountWithBalance[] }) {
  const router = useRouter()
  const [accounts,     setAccounts]     = useState(initial)
  const [editTarget,   setEditTarget]   = useState<AccountWithBalance | null>(null)
  const [editForm,     setEditForm]     = useState<EditForm | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AccountWithBalance | null>(null)
  const [deleteError,  setDeleteError]  = useState('')
  const [deleting,     setDeleting]     = useState(false)

  const totalBalance  = accounts.reduce((s, a) => s + a.balance, 0)
  const totalIngresos = accounts.reduce((s, a) => s + a.ingresos, 0)
  const totalEgresos  = accounts.reduce((s, a) => s + a.egresos, 0)

  const openEdit = (a: AccountWithBalance) => {
    setEditTarget(a)
    setEditForm({ bank_name: a.bank_name, account_number: a.account_number ?? '', initial_balance: String(a.initial_balance) })
  }

  const handleSave = async () => {
    if (!editTarget || !editForm) return
    setSaving(true)
    const res = await actualizarCuentaAction(editTarget.id, {
      bank_name:       editForm.bank_name.trim(),
      account_number:  editForm.account_number.trim() || null,
      initial_balance: Number(editForm.initial_balance),
    })
    if (res.ok) {
      setAccounts(prev => prev.map(a => a.id === editTarget.id
        ? { ...a, bank_name: editForm.bank_name.trim(), account_number: editForm.account_number.trim() || null, initial_balance: Number(editForm.initial_balance) }
        : a
      ))
      setEditTarget(null)
      setEditForm(null)
    }
    setSaving(false)
  }

  const openDelete = (a: AccountWithBalance) => {
    setDeleteTarget(a)
    setDeleteError('')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await eliminarCuentaAction(deleteTarget.id)
    if (res.ok) {
      setAccounts(prev => prev.filter(a => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } else if ('blocked' in res && res.blocked) {
      setDeleteError(`Esta cuenta tiene ${res.txnCount} transaccion(es). Elimina las transacciones primero antes de borrar la cuenta.`)
    } else if ('error' in res) {
      setDeleteError(res.error ?? 'Error al eliminar')
    }
    setDeleting(false)
  }

  const inpCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-xs text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Bancos</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/bancos/conciliacion"
            className="flex items-center gap-2 border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium px-3 py-2.5 rounded-lg transition-colors min-h-[44px]">
            <GitMerge size={15} /> <span className="hidden sm:inline">Conciliar extracto</span><span className="sm:hidden">Conciliar</span>
          </Link>
          <Link href="/bancos/transaccion"
            className="flex items-center gap-2 border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium px-3 py-2.5 rounded-lg transition-colors min-h-[44px]">
            <Plus size={15} /> <span className="hidden sm:inline">Nueva transaccion</span><span className="sm:hidden">Transacción</span>
          </Link>
          <Link href="/bancos/nueva-cuenta"
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]">
            <Plus size={15} /> Nueva cuenta
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 md:mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <p className="text-xs font-semibold text-[#64748B] mb-1 truncate">Saldo total</p>
          <p className="text-xs sm:text-sm md:text-base font-bold text-[#0F172A] truncate">{formatCOP(totalBalance)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <ArrowDownCircle size={12} className="text-green-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-[#64748B] truncate">Ingresos</p>
          </div>
          <p className="text-xs sm:text-sm md:text-base font-bold text-green-600 truncate">{formatCOP(totalIngresos)}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpCircle size={12} className="text-red-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-[#64748B] truncate">Egresos</p>
          </div>
          <p className="text-xs sm:text-sm md:text-base font-bold text-red-500 truncate">{formatCOP(totalEgresos)}</p>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Cuenta</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden md:table-cell">Numero</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Saldo inicial</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden md:table-cell">Ingresos</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden md:table-cell">Egresos</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Saldo actual</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-xs text-[#64748B]">
                  <Landmark size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                  No hay cuentas bancarias registradas
                </td>
              </tr>
            ) : accounts.map(a => (
              <tr key={a.id} className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                onClick={() => router.push(`/bancos/${a.id}`)}>
                <td className="px-3 py-2 text-xs font-medium text-[#0F172A]">{a.bank_name}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden md:table-cell">{a.account_number ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] text-right hidden lg:table-cell">{formatCOP(a.initial_balance)}</td>
                <td className="px-3 py-2 text-xs font-medium text-green-600 text-right hidden md:table-cell">{formatCOP(a.ingresos)}</td>
                <td className="px-3 py-2 text-xs font-medium text-red-500 text-right hidden md:table-cell">{formatCOP(a.egresos)}</td>
                <td className="px-3 py-2 text-xs font-semibold text-[#0F172A] text-right">{formatCOP(a.balance)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)}
                      className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium px-2 py-1 min-h-[36px]">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => openDelete(a)}
                      className="text-[#94A3B8] hover:text-red-500 transition-colors p-1 min-h-[36px]">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {accounts.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#64748B]">
            <Landmark size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
            No hay cuentas bancarias registradas
          </div>
        ) : accounts.map(a => (
          <div key={a.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3 cursor-pointer"
            onClick={() => router.push(`/bancos/${a.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">{a.bank_name}</p>
                {a.account_number && <p className="text-xs text-[#64748B] mt-0.5">{a.account_number}</p>}
              </div>
              <p className="text-base font-bold text-[#0F172A] flex-shrink-0">{formatCOP(a.balance)}</p>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-green-600">+{formatCOP(a.ingresos)}</span>
              <span className="text-xs text-red-500">-{formatCOP(a.egresos)}</span>
              <div className="ml-auto flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => openEdit(a)}
                  className="text-xs text-[#2563EB] font-medium min-h-[36px] px-1">Editar</button>
                <button onClick={() => openDelete(a)}
                  className="text-[#94A3B8] hover:text-red-500 min-h-[36px] px-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editTarget && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">Editar cuenta</h2>
              <button onClick={() => setEditTarget(null)}><X size={18} className="text-[#64748B]" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Nombre del banco *</label>
                <input value={editForm.bank_name} onChange={e => setEditForm(p => p && ({ ...p, bank_name: e.target.value }))}
                  required className={inpCls} placeholder="Bancolombia, Davivienda..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Numero de cuenta</label>
                <input value={editForm.account_number} onChange={e => setEditForm(p => p && ({ ...p, account_number: e.target.value }))}
                  className={inpCls} placeholder="000-000000-00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Saldo inicial (COP)</label>
                <input type="number" value={editForm.initial_balance} onChange={e => setEditForm(p => p && ({ ...p, initial_balance: e.target.value }))}
                  min="0" step="0.01" className={inpCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !editForm.bank_name.trim()}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar cuenta</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara la cuenta <span className="font-medium text-[#0F172A]">{deleteTarget.bank_name}</span> de forma permanente.
            </p>
            {deleteError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              {!deleteError && (
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
