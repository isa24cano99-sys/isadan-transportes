import { supabase } from '@/lib/supabase'
import ImpuestoClient from './ImpuestoClient'

export type TaxPayment = {
  id: string
  year: number
  bimestre: number
  income: number
  rst_gross: number
  pension_contribution: number
  ica: number
  rst_net: number
  total_to_pay: number
  paid: boolean
  paid_date: string | null
  notes: string | null
  created_at: string
}

export default async function ImpuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()

  const [tripsRes, taxRes] = await Promise.all([
    supabase
      .from('trips')
      .select('freight_value, load_date')
      .in('status', ['FACTURADO', 'PAGADO'])
      .gte('load_date', `${year}-01-01`)
      .lte('load_date', `${year}-12-31`),
    supabase
      .from('tax_payments')
      .select('*')
      .eq('year', year)
      .order('bimestre'),
  ])

  const trips       = tripsRes.data   ?? []
  const taxPayments = (taxRes.data    ?? []) as TaxPayment[]

  // Group income by bimestre index 0-5
  const incomeByBimestre: number[] = [0, 0, 0, 0, 0, 0]
  for (const t of trips) {
    if (!t.load_date) continue
    const month  = new Date((t.load_date as string) + 'T00:00:00').getMonth() + 1 // 1-12
    const bimIdx = Math.ceil(month / 2) - 1                                        // 0-5
    incomeByBimestre[bimIdx] += Number(t.freight_value ?? 0)
  }

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6">
      <ImpuestoClient
        year={year}
        availableYears={availableYears}
        incomeByBimestre={incomeByBimestre}
        taxPayments={taxPayments}
      />
    </div>
  )
}
