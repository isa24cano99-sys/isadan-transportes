import Link from 'next/link'
import {
  Calculator, FileCheck, Banknote, ArrowLeftRight, Percent, Briefcase, Coins,
  TrafficCone, CreditCard, UsersRound, Lock, ChevronRight, type LucideIcon,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

// Mapa de navegación del flujo contable operativo. NO es un reporte — cada tarjeta
// es un paso clickeable que lleva a su pantalla real, en el orden en que se ejecutan.
// v1 sin conteos de pendientes (decisión: la primera versión solo ubica; los badges
// vienen después donde de verdad aporten).

type Paso = { n: number; label: string; desc: string; href: string; icon: LucideIcon }
type Fase = { titulo: string; pasos: Paso[] }

const FASES: Fase[] = [
  { titulo: 'Facturación', pasos: [
    { n: 1, label: 'Causación', desc: 'Reconocer el ingreso del viaje', href: '/contabilidad/causaciones', icon: Calculator },
    { n: 2, label: 'Emisión FEIT', desc: 'Emitir la factura electrónica', href: '/contabilidad/emision-facturas', icon: FileCheck },
  ] },
  { titulo: 'Cartera', pasos: [
    { n: 3, label: 'Recibo anticipo', desc: 'Registrar el anticipo del cliente', href: '/contabilidad/recibos-anticipo', icon: Banknote },
    { n: 4, label: 'Cruce cartera', desc: 'Aplicar anticipo contra la factura', href: '/contabilidad/cruce-cartera', icon: ArrowLeftRight },
  ] },
  { titulo: 'Costos del conductor', pasos: [
    { n: 5, label: 'Porcentaje', desc: 'Costo del porcentaje del conductor', href: '/contabilidad/porcentaje-conductor', icon: Percent },
    { n: 6, label: 'Comisión empresa', desc: 'Comisión reconocida en la operación', href: '/contabilidad/comision-empresa', icon: Briefcase },
    { n: 7, label: 'Anticipo conductor', desc: 'Entregas de plata al conductor', href: '/contabilidad/anticipo-conductor', icon: Coins },
  ] },
  { titulo: 'Costos de proveedor', pasos: [
    { n: 8, label: 'Peajes (F2X)', desc: 'Causación mensual de peajes', href: '/contabilidad/peajes', icon: TrafficCone },
    { n: 9, label: 'Pago proveedores', desc: 'Pagar la deuda con proveedores', href: '/contabilidad/pago-proveedores', icon: CreditCard },
    { n: 10, label: 'Conciliar costos DIAN', desc: 'Clasificar otros costos de la DIAN', href: '/contabilidad/conciliacion-costos', icon: FileCheck },
  ] },
  { titulo: 'Nómina y cierre', pasos: [
    { n: 11, label: 'Nómina mensual', desc: 'Capturar la nómina del mes', href: '/contabilidad/nomina-mensual', icon: UsersRound },
    { n: 12, label: 'Cierre de periodo', desc: 'Cerrar el mes y trasladar el resultado', href: '/contabilidad/cierre-periodo', icon: Lock },
  ] },
]

export default function GuiaPage() {
  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Guía del flujo contable</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          El proceso mensual en orden, de la facturación al cierre. Cada tarjeta lleva a su pantalla.
        </p>
      </div>

      <div className="space-y-5">
        {FASES.map((fase, fi) => (
          <div key={fase.titulo}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Fase {fi + 1}
              </span>
              <span className="text-sm font-medium text-[#0F172A]">{fase.titulo}</span>
            </div>
            <div className="flex flex-wrap items-stretch gap-2">
              {fase.pasos.map((paso, pi) => (
                <div key={paso.href} className="flex items-stretch gap-2">
                  <Link
                    href={paso.href}
                    className="group w-52 bg-white border border-[#E2E8F0] rounded-xl p-3.5 hover:border-blue-400 hover:shadow-sm transition-all flex flex-col"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] group-hover:bg-blue-50 flex items-center justify-center shrink-0 transition-colors">
                        <paso.icon size={16} className="text-[#64748B] group-hover:text-blue-600 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#94A3B8] leading-none">Paso {paso.n}</p>
                        <p className="text-sm font-medium text-[#0F172A] truncate">{paso.label}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#64748B] leading-snug">{paso.desc}</p>
                  </Link>
                  {pi < fase.pasos.length - 1 && (
                    <div className="flex items-center text-[#CBD5E1]">
                      <ChevronRight size={18} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
