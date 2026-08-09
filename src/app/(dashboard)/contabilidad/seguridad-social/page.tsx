import { getResumenSSAction, getEstadoPagoSSAction } from './actions'
import SeguridadSocialClient from './SeguridadSocialClient'

export const dynamic = 'force-dynamic'

export default async function SeguridadSocialPage() {
  // Default: julio 2026 (primer mes post-corte, el único con nómina causada hoy).
  const year = 2026, month = 7
  const periodo = `${year}-${String(month).padStart(2, '0')}`
  const [resumen, estadoPago] = await Promise.all([getResumenSSAction(periodo), getEstadoPagoSSAction()])

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Seguridad social (PILA)</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Consolida el pasivo de aportes de las 4 cuentas (EPS, ARL, Caja, Fondo por entidad) en un
          solo pasivo con Aportes en Línea (23709510) y regístra su pago desde el banco. Confirmación manual.
        </p>
      </div>
      <SeguridadSocialClient initialYear={year} initialMonth={month} initialResumen={resumen} initialEstadoPago={estadoPago} />
    </div>
  )
}
