'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type LegalizacionCalculo = {
  id: string
  date: string | null
  balance: number
  porcentaje: number
  favorConductor: number
  favorEmpresa: number
  trip: { trip_number: string; origin: string; destination: string } | null
}

export type NominaCalculo = {
  legalizaciones: LegalizacionCalculo[]
  totalPercentage: number
  totalFavorConductor: number
  totalFavorEmpresa: number
  primaCalculada: number
}

export async function calcularNominaAction(
  driverId: string,
  year: number,
  month: number,
  salary: number,
  hireDate: string,
): Promise<{ ok: boolean; data?: NominaCalculo; error?: string }> {
  const padMonth = String(month).padStart(2, '0')
  const dateFrom = `${year}-${padMonth}-01`
  const dateTo   = `${year}-${padMonth}-31`

  const { data: legs, error } = await supabase
    .from('legalizations')
    .select('id, balance, advance_amount, total_expenses, date, trips(trip_number, origin, destination)')
    .eq('driver_id', driverId)
    .eq('status', 'APROBADA')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date')

  if (error) return { ok: false, error: error.message }

  const legalizaciones: LegalizacionCalculo[] = (legs ?? []).map(l => {
    const bal = Number(l.balance ?? 0)
    const adv = Number(l.advance_amount ?? 0)
    const exp = Number(l.total_expenses ?? 0)
    return {
      id:             l.id,
      date:           l.date,
      balance:        bal,
      porcentaje:     bal + adv - exp,     // porcentaje_calculado = balance + advance - expenses
      favorConductor: Math.max(0, exp - adv), // reembolso cuando conductor puso más que el anticipo
      favorEmpresa:   Math.max(0, adv - exp), // sobrante cuando anticipo superó gastos
      trip:           l.trips as any,
    }
  })

  const totalPercentage    = legalizaciones.reduce((s, l) => s + l.porcentaje, 0)
  const totalFavorConductor = legalizaciones.reduce((s, l) => s + l.favorConductor, 0)
  const totalFavorEmpresa   = legalizaciones.reduce((s, l) => s + l.favorEmpresa, 0)
  const primaCalculada      = calcularPrima(salary, hireDate, year, month)

  return { ok: true, data: { legalizaciones, totalPercentage, totalFavorConductor, totalFavorEmpresa, primaCalculada } }
}

function calcularPrima(salary: number, hireDate: string, year: number, month: number): number {
  if (month !== 6 && month !== 12) return 0

  const hire           = new Date(hireDate + 'T00:00:00')
  const semesterStart  = month === 6 ? new Date(year, 0, 1) : new Date(year, 6, 1)
  const semesterEnd    = month === 6 ? new Date(year, 5, 30) : new Date(year, 11, 31)
  const effectiveStart = hire > semesterStart ? hire : semesterStart

  if (effectiveStart > semesterEnd) return 0

  const monthsWorked = Math.min(
    6,
    Math.round(
      (semesterEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24 * 30),
    ) + 1,
  )

  return Math.round((salary / 12) * monthsWorked)
}

export async function guardarNominaAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const driverId          = formData.get('driver_id') as string
  const year              = Number(formData.get('year'))
  const month             = Number(formData.get('month'))
  const baseSalary        = Number(formData.get('base_salary'))
  const totalPercentage   = Number(formData.get('total_percentage'))
  const totalFavorCond    = Number(formData.get('total_favor_conductor'))
  const totalFavorEmpresa = Number(formData.get('total_favor_empresa'))
  const prima             = Number(formData.get('prima'))
  const otherAdditions    = Number(formData.get('other_additions'))
  const otherDeductions   = Number(formData.get('other_deductions'))
  const notes             = (formData.get('notes') as string) || null

  const netPayment = baseSalary + totalPercentage + totalFavorCond - totalFavorEmpresa + prima + otherAdditions - otherDeductions

  const meses   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const period  = `${meses[month - 1]} ${year}`

  // Guardar en tabla payroll
  const { error: payrollError } = await supabase
    .from('payroll')
    .upsert({
      driver_id:             driverId,
      year,
      month,
      period,
      base_salary:           baseSalary,
      total_percentage:      totalPercentage,
      total_favor_conductor: totalFavorCond,
      total_favor_empresa:   totalFavorEmpresa,
      prima,
      other_additions:       otherAdditions,
      other_deductions:      otherDeductions,
      net_payment:           netPayment,
      paid:                  true,
      paid_date:             new Date().toISOString().split('T')[0],
      notes,
    }, { onConflict: 'driver_id,year,month' })

  if (payrollError) return { ok: false, error: payrollError.message }

  // Obtener conductor
  const { data: driver } = await supabase
    .from('drivers')
    .select('full_name')
    .eq('id', driverId)
    .single()

  // Registrar EGRESO en banco (cuenta principal)
  const [{ data: account }, { data: nomCat }] = await Promise.all([
    supabase.from('bank_accounts').select('id').limit(1).single(),
    supabase.from('transaction_categories').select('id, puc_code').ilike('name', '%nómina%conductores%').eq('active', true).maybeSingle(),
  ])

  if (account) {
    await supabase.from('bank_transactions').insert({
      account_id:   account.id,
      type:         'EGRESO',
      amount:       netPayment,
      date:         new Date().toISOString().split('T')[0],
      description:  `Pago nómina ${driver?.full_name ?? ''} ${period}`,
      category:     nomCat?.puc_code ?? 'SIN_CLASIFICAR',
      category_id:  nomCat?.id ?? null,
      source:       'NOMINA',
    })
  }

  revalidatePath('/nomina')
  revalidatePath('/bancos')
  return { ok: true }
}
