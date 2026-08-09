import { getEmitidasAction, getNotasCreditoEmitidasAction, getViajesFacturablesAction } from './actions'
import FacturacionClient from './FacturacionClient'

export const dynamic = 'force-dynamic'

export default async function FacturacionPage() {
  const [emitidas, notasCredito, viajes] = await Promise.all([
    getEmitidasAction(), getNotasCreditoEmitidasAction(), getViajesFacturablesAction(),
  ])
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Facturación</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          El ingreso se reconoce con la <strong>factura FEIT emitida y verificada contra la DIAN</strong>
          {' '}(DB 13050501 Cartera facturada / CR 41450510 Ingreso). El viaje se auto-sugiere por el folio;
          confirmas tú. Las emitidas y sus notas crédito se importan en <strong>Conciliar costos DIAN</strong>.
        </p>
      </div>
      <FacturacionClient emitidas={emitidas} notasCredito={notasCredito} viajes={viajes} />
    </div>
  )
}
