import { supabase } from '@/lib/supabase'
import { PrestacionesClient } from './PrestacionesClient'

async function getPersonas() {
  const [empsRes, drvsRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, document, hire_date, salary, active')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('drivers')
      .select('id, full_name, document, hire_date, salary, active')
      .eq('active', true)
      .order('full_name'),
  ])
  const personas = [
    ...(empsRes.data ?? []).map(e => ({ ...e, sourceType: 'empleado' as const })),
    ...(drvsRes.data ?? []).map(d => ({ ...d, sourceType: 'conductor' as const })),
  ].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'))
  return personas
}

async function getHistorial() {
  const { data } = await supabase
    .from('social_benefits')
    .select('*, employees(full_name, document, hire_date, salary), drivers(full_name, document, hire_date, salary)')
    .eq('paid', true)
    .order('paid_date', { ascending: false })
  return data ?? []
}

export default async function PrestacionesPage() {
  const [personas, historial] = await Promise.all([getPersonas(), getHistorial()])

  const totalEmpleados  = personas.filter(p => p.sourceType === 'empleado').length
  const totalConductores = personas.filter(p => p.sourceType === 'conductor').length

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-[#0F172A]">Prestaciones sociales</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          {totalEmpleados} empleado{totalEmpleados !== 1 ? 's' : ''} · {totalConductores} conductor{totalConductores !== 1 ? 'es' : ''}
        </p>
      </div>

      <PrestacionesClient personas={personas as any} historial={historial as any} />
    </div>
  )
}
