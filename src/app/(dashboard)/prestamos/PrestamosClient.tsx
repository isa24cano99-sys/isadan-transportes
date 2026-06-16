'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, X, CreditCard, CheckCircle2 } from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import { actualizarPrestamoAction, eliminarPrestamoAction, pagarCuotaAction } from './actions'

type Installment = {
  id: string
  status: string
  capital: number
  payment_amount: number
  due_date: string
  installment_number: number
}

type Prestamo = {
  id: string
  entity: string
  loan_amount: number
  interest_rate: number
  term_months: number
  monthly_payment: number
  active: boolean
  start_date: string
  loan_installments: Installment[]
}

function num(v: string) { return parseFloat(v) || 0 }

function calcCuota(amount: number, rate: number, term: number): number {
  if (!amount || !rate || !term) return 0
  const r = rate / 100
  const factor = Math.pow(1 + r, term)
  return (amount * r * factor) / (factor - 1)
}

function getDaysInfo(dueDateStr: string): { label: string; cls: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due  = new Date(dueDateStr + 'T00:00:00')
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days < 0)   return { label: 'VENCIDA',      cls: 'text-red-600 font-bold' }
  if (days === 0) return { label: 'Vence hoy',    cls: 'text-red-600 font-bold' }
  if (days <= 5)  return { label: `${days} días`, cls: 'text-red-600 font-semibold' }
  if (days <= 15) return { label: `${days} días`, cls: 'text-yellow-600 font-semibold' }
  return              { label: `${days} días`, cls: 'text-green-700 font-semibold' }
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ prestamo, onClose }: { prestamo: Prestamo; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [entity, setEntity]       = useState(prestamo.entity)
  const [amount, setAmount]       = useState(String(prestamo.loan_amount))
  const [rate, setRate]           = useState(String(prestamo.interest_rate))
  const [term, setTerm]           = useState(String(prestamo.term_months))
  const [startDate, setStartDate] = useState(prestamo.start_date)

  const cuota          = calcCuota(num(amount), num(rate), num(term))
  const totalPagar     = cuota * num(term)
  const totalIntereses = totalPagar - num(amount)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await actualizarPrestamoAction(prestamo.id, new FormData(e.currentTarget))
    if (result.ok) { router.refresh(); onClose() }
    else { setError(result.error ?? 'Error al actualizar'); setLoading(false) }
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Editar préstamo</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A] transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelCls}>Entidad *</label>
            <input name="entity" type="text" value={entity} onChange={e => setEntity(e.target.value)} required className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Monto (COP) *</label>
              <input name="amount" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tasa mensual (%) *</label>
              <input name="interest_rate" type="number" min="0.001" step="0.001" value={rate} onChange={e => setRate(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Plazo (meses) *</label>
              <input name="term_months" type="number" min="1" max="360" value={term} onChange={e => setTerm(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha de inicio *</label>
              <input name="start_date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className={inputCls} />
            </div>
          </div>

          {cuota > 0 && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-[#64748B]">Nueva cuota mensual</span>
                <span className="text-sm font-bold text-[#2563EB]">{formatCOP(cuota)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-[#64748B]">Total a pagar</span>
                <span className="text-xs font-medium text-[#0F172A]">{formatCOP(totalPagar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-[#64748B]">Total intereses</span>
                <span className="text-xs font-medium text-[#0F172A]">{formatCOP(totalIntereses)}</span>
              </div>
            </div>
          )}

          <p className="text-[11px] text-[#F59E0B] font-medium">
            Al guardar se borrarán todas las cuotas actuales y se generará una nueva tabla de amortización.
          </p>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ prestamo, onClose }: { prestamo: Prestamo; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleDelete = async () => {
    setLoading(true)
    const result = await eliminarPrestamoAction(prestamo.id)
    if (result.ok) { router.refresh(); onClose() }
    else { setError(result.error ?? 'Error al eliminar'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">¿Eliminar préstamo?</h2>
            <p className="text-sm text-[#64748B] mt-1">
              Se eliminará <span className="font-medium text-[#0F172A]">{prestamo.entity}</span> y todas sus cuotas. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-red-500 font-medium mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {loading ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Loan Card ─────────────────────────────────────────────────────────────────

function LoanCard({ p, onEdit, onDelete }: { p: Prestamo; onEdit: () => void; onDelete: () => void }) {
  const router = useRouter()
  const [paying, setPaying] = useState(false)
  const [error, setError]   = useState('')

  const installments = p.loan_installments ?? []
  const paid    = installments.filter(i => i.status === 'PAGADA').length
  const total   = installments.length
  const pending = [...installments]
    .filter(i => i.status === 'PENDIENTE')
    .sort((a, b) => a.installment_number - b.installment_number)

  const saldo    = pending.reduce((s, i) => s + (i.capital ?? 0), 0)
  const next     = pending[0] ?? null
  const daysInfo = next ? getDaysInfo(next.due_date) : null
  const isVencida = daysInfo?.label === 'VENCIDA'

  const handlePay = async () => {
    if (!next) return
    setPaying(true)
    setError('')
    const result = await pagarCuotaAction(next.id)
    if (result.ok) router.refresh()
    else setError(result.error ?? 'Error al pagar')
    setPaying(false)
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/prestamos/${p.id}`} className="text-base font-semibold text-[#0F172A] hover:text-[#2563EB] transition-colors">
            {p.entity}
          </Link>
          <p className="text-xs text-[#64748B] mt-0.5">{p.term_months} meses · desde {formatDate(p.start_date)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
            p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {p.active ? 'Activo' : 'Inactivo'}
          </span>
          <button onClick={onEdit} className="p-1.5 text-[#94A3B8] hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-[#94A3B8] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-[#64748B] mb-1.5">
          <span>Cuotas pagadas</span>
          <span className="font-medium text-[#0F172A]">{paid} / {total}</span>
        </div>
        <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
          <div
            className="bg-[#2563EB] h-1.5 rounded-full transition-all"
            style={{ width: total > 0 ? `${(paid / total) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#F8FAFC] rounded-lg p-3">
          <p className="text-[10px] text-[#64748B] mb-1">Saldo pendiente</p>
          <p className="text-sm font-bold text-[#0F172A]">{formatCOP(saldo)}</p>
        </div>
        <div className="bg-[#F8FAFC] rounded-lg p-3">
          <p className="text-[10px] text-[#64748B] mb-1">Próxima cuota</p>
          {next ? (
            <>
              <p className="text-sm font-bold text-[#0F172A]">{formatCOP(next.payment_amount)}</p>
              <p className="text-[10px] text-[#64748B] mt-0.5">{formatDate(next.due_date)}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-green-700">Al día</p>
          )}
        </div>
        <div className="bg-[#F8FAFC] rounded-lg p-3">
          <p className="text-[10px] text-[#64748B] mb-1">Vencimiento</p>
          {daysInfo ? (
            <p className={`text-sm ${daysInfo.cls}`}>{daysInfo.label}</p>
          ) : (
            <p className="text-sm text-[#64748B]">—</p>
          )}
        </div>
      </div>

      {/* Pay button */}
      {error && <p className="text-xs text-red-500 font-medium -mt-1">{error}</p>}

      {next ? (
        <button
          onClick={handlePay}
          disabled={paying}
          className={`w-full text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
            isVencida
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
          }`}
        >
          {paying ? 'Pagando...' : 'Pagar cuota mes en curso'}
        </button>
      ) : (
        <div className="w-full flex items-center justify-center gap-2 bg-green-50 text-green-700 text-sm font-medium py-2.5 rounded-lg">
          <CheckCircle2 size={15} />
          Todas las cuotas pagadas
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PrestamosClient({ prestamos }: { prestamos: Prestamo[] }) {
  const [editing,  setEditing]  = useState<Prestamo | null>(null)
  const [deleting, setDeleting] = useState<Prestamo | null>(null)

  return (
    <>
      {editing  && <EditModal     prestamo={editing}  onClose={() => setEditing(null)}  />}
      {deleting && <DeleteConfirm prestamo={deleting} onClose={() => setDeleting(null)} />}

      {prestamos.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl py-12 text-center">
          <CreditCard size={32} className="text-[#CBD5E1] mx-auto mb-3" />
          <p className="text-sm text-[#64748B]">No hay préstamos registrados</p>
          <Link href="/prestamos/nuevo" className="text-sm text-[#2563EB] font-medium mt-1 inline-block">
            Registrar primer préstamo →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prestamos.map(p => (
            <LoanCard
              key={p.id}
              p={p}
              onEdit={() => setEditing(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}
    </>
  )
}
