import { supabase } from '@/lib/supabase'
import NominaClient from './NominaClient'
import PlanillaSegSocialClient from './PlanillaSegSocialClient'

export const dynamic = 'force-dynamic'

async function getNominaData() {
  const [{ data: driversRaw }, { data: payrolls }, { data: bankAccounts }] = await Promise.all([
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
    supabase
      .from('bank_accounts')
      .select('id, bank_name')
      .order('bank_name'),
  ])

  const payrollByDriver = new Map<string, typeof payrolls>()
  for (const p of payrolls ?? []) {
    const arr = payrollByDriver.get(p.driver_id) ?? []
    arr.push(p)
    payrollByDriver.set(p.driver_id, arr)
  }

  const drivers = (driversRaw ?? []).map(d => ({
    ...d,
    payrollHistory: payrollByDriver.get(d.id) ?? [],
  }))

  return { drivers, bankAccounts: bankAccounts ?? [] }
}

export default async function NominaPage() {
  const { drivers, bankAccounts } = await getNominaData()

  const segSocialDrivers = drivers.map(d => ({
    id:        d.id,
    full_name: d.full_name,
    document:  d.document ?? '',
    salary:    Number(d.salary ?? 0),
  }))

  return (
    <div>
      <NominaClient drivers={drivers as any} />
      <div className="px-4 md:px-6 pb-6">
        <PlanillaSegSocialClient
          drivers={segSocialDrivers}
          bankAccounts={bankAccounts as any}
        />
      </div>
    </div>
  )
}
