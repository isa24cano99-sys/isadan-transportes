'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'

export type LegalizacionCalculo = {
  id: string
  date: string | null
  balance: number
  advance_amount: number
  total_expenses: number
  trip: { trip_number: string; manifest_number: string | null; manifest_auth: string | null; origin: string; destination: string; freight_value: number } | null
}

export type NominaCalculo = {
  legalizaciones: LegalizacionCalculo[]
  totalFavorConductor: number
  totalFavorEmpresa: number
  primaCalculada: number
  primaSource: { paidDate: string } | null
}

export async function calcularNominaAction(
  driverId: string,
  year: number,
  month: number,
  salary: number,
  hireDate: string,
): Promise<{ ok: boolean; data?: NominaCalculo; error?: string }> {
  const padMonth = String(month).padStart(2, '0')
  const lastDay  = new Date(year, month, 0).getDate()
  const dateFrom = `${year}-${padMonth}-01`
  const dateTo   = `${year}-${padMonth}-${lastDay}`

  const { data: legs, error } = await supabase
    .from('legalizations')
    .select('*, trips(trip_number, manifest_number, manifest_auth, origin, destination, freight_value)')
    .eq('driver_id', driverId)
    .eq('status', 'APROBADA')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date')

  if (error) return { ok: false, error: error.message }

  const legalizaciones: LegalizacionCalculo[] = (legs ?? []).map(l => ({
    id:             l.id,
    date:           l.date,
    balance:        Number(l.balance ?? 0),
    advance_amount: Number(l.advance_amount ?? 0),
    total_expenses: Number(l.total_expenses ?? 0),
    trip:           l.trips as any,
  }))

  // balance > 0 → advance exceeded expenses → conductor owes company → resta del pago
  // balance < 0 → expenses exceeded advance → company owes conductor → suma al pago
  const totalFavorConductor = legalizaciones.reduce((s, l) => s + Math.max(0, -l.balance), 0)
  const totalFavorEmpresa   = legalizaciones.reduce((s, l) => s + Math.max(0,  l.balance), 0)

  // Look up prima from social_benefits (paid record for this driver in the current year)
  let primaCalculada = 0
  let primaSource: { paidDate: string } | null = null

  // Semester window: months 1-6 → Jan-Jun, months 7-12 → Jul-Dec
  const semFrom = month <= 6 ? `${year}-01-01` : `${year}-07-01`
  const semTo   = month <= 6 ? `${year}-06-30` : `${year}-12-31`

  const { data: primaRecord } = await supabase
    .from('social_benefits')
    .select('prima, paid_date')
    .eq('driver_id', driverId)
    .eq('paid', true)
    .gt('prima', 0)
    .gte('paid_date', semFrom)
    .lte('paid_date', semTo)
    .order('paid_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (primaRecord) {
    primaCalculada = Number(primaRecord.prima)
    primaSource    = { paidDate: primaRecord.paid_date }
  }

  return { ok: true, data: { legalizaciones, totalFavorConductor, totalFavorEmpresa, primaCalculada, primaSource } }
}


export async function guardarNominaAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const driverId          = formData.get('driver_id') as string
  const year              = Number(formData.get('year'))
  const month             = Number(formData.get('month'))
  const baseSalary        = Number(formData.get('base_salary'))
  const totalFavorCond    = Number(formData.get('total_favor_conductor'))
  const totalFavorEmpresa = Number(formData.get('total_favor_empresa'))
  const prima             = Number(formData.get('prima'))
  const otherAdditions    = Number(formData.get('other_additions'))
  const otherDeductions   = Number(formData.get('other_deductions'))
  const paidDate          = (formData.get('paid_date') as string) || hoyColombia()
  const notes             = (formData.get('notes') as string) || null

  const netPayment = baseSalary + totalFavorCond - totalFavorEmpresa + prima + otherAdditions - otherDeductions

  const meses  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const period = `${meses[month - 1]} ${year}`

  const { data: existing } = await supabase
    .from('payroll')
    .select('id')
    .eq('driver_id', driverId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  const { error: payrollError } = await supabase
    .from('payroll')
    .upsert({
      driver_id:             driverId,
      year,
      month,
      period,
      base_salary:           baseSalary,
      total_percentage:      0,
      total_favor_conductor: totalFavorCond,
      total_favor_empresa:   totalFavorEmpresa,
      prima,
      other_additions:       otherAdditions,
      other_deductions:      otherDeductions,
      net_payment:           netPayment,
      paid:                  true,
      paid_date:             paidDate,
      notes,
    }, { onConflict: 'driver_id,year,month' })

  if (payrollError) return { ok: false, error: payrollError.message }

  const { data: driver } = await supabase
    .from('drivers').select('full_name').eq('id', driverId).single()

  const description = `Pago nómina ${driver?.full_name ?? ''} ${period}`

  if (existing) {
    await supabase
      .from('bank_transactions')
      .update({ amount: netPayment, description })
      .eq('source', 'NOMINA')
      .ilike('description', `%${driver?.full_name ?? ''}%${period}%`)
  } else {
    const [{ data: account }, { data: nomCat }] = await Promise.all([
      supabase.from('bank_accounts').select('id').limit(1).single(),
      supabase.from('transaction_categories').select('id, puc_code').ilike('name', '%nómina%conductores%').eq('active', true).maybeSingle(),
    ])
    if (account) {
      await supabase.from('bank_transactions').insert({
        account_id:  account.id,
        type:        'EGRESO',
        amount:      netPayment,
        date:        hoyColombia(),
        description,
        category:    nomCat?.puc_code ?? 'SIN_CLASIFICAR',
        category_id: nomCat?.id ?? null,
        source:      'NOMINA',
      })
    }
  }

  revalidatePath('/nomina')
  revalidatePath('/bancos')
  return { ok: true }
}

export async function eliminarNominaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: payroll } = await supabase
    .from('payroll')
    .select('driver_id, period')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('payroll').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  if (payroll) {
    const { data: driver } = await supabase
      .from('drivers').select('full_name').eq('id', payroll.driver_id).single()
    if (driver) {
      await supabase
        .from('bank_transactions')
        .delete()
        .eq('source', 'NOMINA')
        .ilike('description', `%${driver.full_name}%${payroll.period}%`)
    }
  }

  revalidatePath('/nomina')
  revalidatePath('/bancos')
  return { ok: true }
}
