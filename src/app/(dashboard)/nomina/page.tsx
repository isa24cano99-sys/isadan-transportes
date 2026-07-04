import { supabase } from '@/lib/supabase'
import NominaClient from './NominaClient'

export const dynamic = 'force-dynamic'

async function getNominaData() {
  const [{ data: driversRaw }, { data: payrolls }] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, full_name, document, salary, hire_date, active')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('payroll')
      .select('id, driver_id, year, month, period, net_payment, paid, paid_date, base_salary, total_percentage, total_favor_conductor, total_favor_empresa, prima, other_additions, other_deductions, notes')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
  ])

  const payrollByDriver = new Map<string, typeof payrolls>()
  for (const p of payrolls ?? []) {
    const arr = payrollByDriver.get(p.driver_id) ?? []
    arr.push(p)
    payrollByDriver.set(p.driver_id, arr)
  }

  return (driversRaw ?? []).map(d => ({
    ...d,
    payrollHistory: payrollByDriver.get(d.id) ?? [],
  }))
}

export default async function NominaPage() {
  const drivers = await getNominaData()
  return <NominaClient drivers={drivers as any} />
}
