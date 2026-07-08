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

  const [invoicesRes, ssRes, taxRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('issue_date, total_amount')
      .eq('invoice_type', 'EMITIDA')
      .gte('issue_date', `${year}-01-01`)
      .lte('issue_date', `${year}-12-31`),
    supabase
      .from('payroll_social_security')
      .select('month, pension')
      .eq('year', year),
    supabase
      .from('tax_payments')
      .select('*')
      .eq('year', year)
      .order('bimestre'),
  ])

  const invoices    = invoicesRes.data ?? []
  const ssRows      = ssRes.data       ?? []
  const taxPayments = (taxRes.data     ?? []) as TaxPayment[]

  // Income from invoices (EMITIDA) grouped by bimestre (0-5)
  const incomeByBimestre: number[] = [0, 0, 0, 0, 0, 0]
  for (const inv of invoices) {
    if (!inv.issue_date) continue
    const month  = new Date((inv.issue_date as string) + 'T00:00:00').getMonth() + 1
    const bimIdx = Math.ceil(month / 2) - 1
    incomeByBimestre[bimIdx] += Number(inv.total_amount ?? 0)
  }

  // Pension empresa from payroll_social_security grouped by bimestre
  const pensionByBimestre: number[] = [0, 0, 0, 0, 0, 0]
  const hasSsData: boolean[]        = [false, false, false, false, false, false]
  for (const row of ssRows) {
    if (!row.month) continue
    const bimIdx = Math.ceil(row.month / 2) - 1
    pensionByBimestre[bimIdx] += Number(row.pension ?? 0)
    hasSsData[bimIdx] = true
  }

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6">
      <ImpuestoClient
        year={year}
        availableYears={availableYears}
        incomeByBimestre={incomeByBimestre}
        pensionByBimestre={pensionByBimestre}
        hasSsData={hasSsData}
        taxPayments={taxPayments}
      />
    </div>
  )
}
