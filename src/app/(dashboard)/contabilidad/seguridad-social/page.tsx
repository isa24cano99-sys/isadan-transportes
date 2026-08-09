import { getResumenSSAction } from './actions'
import SeguridadSocialClient from './SeguridadSocialClient'

export const dynamic = 'force-dynamic'

export default async function SeguridadSocialPage() {
  // Default: julio 2026 (primer mes post-corte, el único con nómina causada hoy).
  const year = 2026, month = 7
  const periodo = `${year}-${String(month).padStart(2, '0')}`
  const resumen = await getResumenSSAction(periodo)

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Consolidación de seguridad social</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Mueve el pasivo de aportes de las 4 cuentas individuales (EPS, ARL, Caja, Fondo de pensión
          por entidad) a un solo pasivo con Aportes en Línea (23709510). Confirmación manual.
        </p>
      </div>
      <SeguridadSocialClient initialYear={year} initialMonth={month} initialResumen={resumen} />
    </div>
  )
}
