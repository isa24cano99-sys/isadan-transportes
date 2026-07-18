import { supabase } from '@/lib/supabase'
import { formatCOP, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { InstallmentsTable } from './InstallmentsTable'
import { SyncButton } from './SyncButton'
import { AbonoCapitalButton } from './AbonoCapitalButton'

async function getPrestamo(id: string) {
  const { data } = await supabase
    .from('loans')
    .select(`
      id, entity, loan_amount, interest_rate, term_months, monthly_payment, active, start_date,
      loan_installments(
        id, installment_number, due_date,
        capital, interest, payment_amount, remaining_balance, status
      )
    `)
    .eq('id', id)
    .single()
  return data
}

export default async function PrestamoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const prestamo = await getPrestamo(id)
  if (!prestamo) notFound()

  // Ordenar por fecha (para que los abonos aparezcan en su lugar cronológico).
  const installments = [...(prestamo.loan_installments ?? [])].sort(
    (a: any, b: any) =>
      (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.installment_number - b.installment_number,
  )

  // Los abonos a capital (installment_number < 1) no cuentan como cuotas.
  const cuotas = installments.filter((i: any) => i.installment_number >= 1)
  const paid  = cuotas.filter((i: any) => i.status === 'PAGADA').length
  const total = cuotas.length
  const saldo = installments
    .filter((i: any) => i.status === 'PENDIENTE')
    .reduce((s: number, i: any) => s + (i.capital ?? 0), 0)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/prestamos"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ChevronLeft size={16} />
          Préstamos
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">{prestamo.entity}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Monto"           value={formatCOP(prestamo.loan_amount)} />
        <StatCard label="Cuota mensual"   value={formatCOP(prestamo.monthly_payment)} />
        <StatCard label="Cuotas pagadas"  value={`${paid} / ${total}`} />
        <StatCard label="Saldo pendiente" value={formatCOP(saldo)} highlight />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[#0F172A]">Tabla de amortización</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            {prestamo.interest_rate}% mensual · {prestamo.term_months} meses · desde {formatDate(prestamo.start_date)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-100 inline-block border border-green-200" />
              Pagada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-yellow-100 inline-block border border-yellow-200" />
              Próxima
            </span>
          </div>
          <AbonoCapitalButton loanId={prestamo.id} installments={installments as any} />
          <SyncButton loanId={prestamo.id} />
        </div>
      </div>

      <InstallmentsTable installments={installments as any} loanId={prestamo.id} />
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
      <p className="text-xs text-[#64748B] mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
        {value}
      </p>
    </div>
  )
}
