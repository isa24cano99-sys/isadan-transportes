import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PrestamosClient } from './PrestamosClient'

async function getPrestamos() {
  const { data } = await supabase
    .from('loans')
    .select(`
      id, entity, loan_amount, interest_rate, term_months, monthly_payment, active, start_date,
      loan_installments(id, status, capital, payment_amount, due_date, installment_number)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function PrestamosPage() {
  const prestamos = await getPrestamos()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Préstamos</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{prestamos.length} préstamos registrados</p>
        </div>
        <Link
          href="/prestamos/nuevo"
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Nuevo préstamo
        </Link>
      </div>

      <PrestamosClient prestamos={prestamos as any} />
    </div>
  )
}
