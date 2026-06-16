import { supabase } from '@/lib/supabase'
import { formatCOP, formatDate } from '@/lib/utils'
import { PrestacionesClient } from './PrestacionesClient'

async function getEmployees() {
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, document, hire_date, salary, active')
    .eq('active', true)
    .order('full_name')
  return data ?? []
}

async function getHistorial() {
  const { data } = await supabase
    .from('social_benefits')
    .select('*, employees(full_name)')
    .eq('paid', true)
    .order('paid_date', { ascending: false })
  return data ?? []
}

export default async function PrestacionesPage() {
  const [employees, historial] = await Promise.all([getEmployees(), getHistorial()])

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Prestaciones sociales</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          {employees.length} empleado{employees.length !== 1 ? 's' : ''} activo{employees.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Employee cards */}
      <PrestacionesClient employees={employees as any} />

      {/* Historial */}
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">
          Historial de liquidaciones
          <span className="ml-2 text-xs font-normal text-[#64748B]">{historial.length} registros</span>
        </h2>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Período</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Cesantías</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Intereses</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Prima</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Vacaciones</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Fecha pago</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-sm text-[#64748B]">
                    No hay liquidaciones registradas
                  </td>
                </tr>
              ) : (
                historial.map((b: any) => {
                  const total    = (b.cesantias ?? 0) + (b.intereses ?? 0) + (b.prima ?? 0) + (b.vacaciones ?? 0)
                  const period   = String(b.period ?? '')
                  const isLiq    = period.endsWith('LIQ')
                  const isPrima  = period.endsWith('PRIMA')
                  return (
                    <tr key={b.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">
                        {b.employees?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-[#64748B]">{b.period}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(b.cesantias ?? 0)}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(b.intereses ?? 0)}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(b.prima ?? 0)}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] text-right">{formatCOP(b.vacaciones ?? 0)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-[#0F172A] text-right">{formatCOP(total)}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        {b.paid_date ? formatDate(b.paid_date) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                          isLiq   ? 'bg-orange-100 text-orange-700' :
                          isPrima ? 'bg-purple-100 text-purple-700' :
                                    'bg-blue-100 text-blue-700'
                        }`}>
                          {isLiq ? 'Desvinculación' : isPrima ? 'Solo prima' : 'Pago anual'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
