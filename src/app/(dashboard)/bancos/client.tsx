'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { Plus, ArrowDownCircle, ArrowUpCircle, Landmark, Pencil, Trash2, X, Upload } from 'lucide-react'
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Bancos</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/bancos/importar"
            className="flex items-center gap-2 border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Upload size={15} /> Importar extracto
          </Link>
          <Link href="/bancos/transaccion"
            className="flex items-center gap-2 border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Nueva transaccion
          </Link>
          <Link href="/bancos/nueva-cuenta"
            className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
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
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Cuenta</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Numero</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Saldo inicial</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Ingresos</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Egresos</th>
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
                <td className="px-3 py-2 text-xs text-[#64748B]">{a.account_number ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] text-right">{formatCOP(a.initial_balance)}</td>
                <td className="px-3 py-2 text-xs font-medium text-green-600 text-right">{formatCOP(a.ingresos)}</td>
                <td className="px-3 py-2 text-xs font-medium text-red-500 text-right">{formatCOP(a.egresos)}</td>
                <td className="px-3 py-2 text-xs font-semibold text-[#0F172A] text-right">{formatCOP(a.balance)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)}
                      className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium px-2 py-1">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => openDelete(a)}
                      className="text-[#94A3B8] hover:text-red-500 transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editTarget && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
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
