'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Route, ClipboardCheck, Landmark, GitMerge, FileText,
  Building2, HandCoins, PiggyBank, Users, Truck, User, Contact, Folder,
  Wallet, BarChart3, Receipt, IdCard, Calculator, FileCheck, Banknote, ArrowLeftRight, Percent, UsersRound, Coins, BookOpen, BookText, Scale, TrafficCone, CreditCard, Briefcase, Building, TrendingUp, Lock, FileSpreadsheet, Map, type LucideIcon,
} from 'lucide-react'

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string }
type NavSection = { title?: string; items: NavItem[] }

const sections: NavSection[] = [
  { items: [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Control', items: [
    { href: '/conductores', label: 'Conductores', icon: User },
    { href: '/vehiculos',   label: 'Vehículos',   icon: Truck },
    { href: '/terceros',    label: 'Terceros',    icon: IdCard },
    { href: '/clientes',    label: 'Clientes',    icon: Contact, badge: 'legacy' },
  ] },
  { title: 'Operación', items: [
    { href: '/viajes',              label: 'Viajes',         icon: Route },
    { href: '/legalizaciones',      label: 'Legalizaciones', icon: ClipboardCheck },
    { href: '/facturas',            label: 'Facturación',    icon: FileText },
    { href: '/bancos',              label: 'Bancos',         icon: Landmark },
    { href: '/bancos/conciliacion', label: 'Conciliación',   icon: GitMerge },
    { href: '/cartera',             label: 'Cartera',        icon: Wallet },
    { href: '/proveedores',         label: 'Proveedores',    icon: Building2 },
    { href: '/documentos',          label: 'Documentos',     icon: Folder },
    { href: '/prestamos',           label: 'Préstamos',      icon: HandCoins },
    { href: '/prestaciones',        label: 'Prestaciones',   icon: PiggyBank },
    { href: '/nomina',              label: 'Nómina',         icon: Users },
  ] },
  { title: 'Contabilidad', items: [
    { href: '/contabilidad/guia',              label: 'Guía / Mapa',      icon: Map },
    { href: '/contabilidad/causaciones',       label: 'Causaciones',      icon: Calculator },
    { href: '/contabilidad/emision-facturas',  label: 'Emisión FEIT',     icon: FileCheck },
    { href: '/contabilidad/recibos-anticipo',  label: 'Recibos anticipo', icon: Banknote },
    { href: '/contabilidad/cruce-cartera',     label: 'Cruce cartera',    icon: ArrowLeftRight },
    { href: '/contabilidad/porcentaje-conductor', label: 'Porcentaje cond.', icon: Percent },
    { href: '/contabilidad/comision-empresa',  label: 'Comisión empresa', icon: Briefcase },
    { href: '/contabilidad/nomina-mensual',    label: 'Nómina mensual',   icon: UsersRound },
    { href: '/contabilidad/anticipo-conductor', label: 'Anticipo cond.',  icon: Coins },
    { href: '/contabilidad/peajes',            label: 'Peajes (F2X)',     icon: TrafficCone },
    { href: '/contabilidad/pago-proveedores',  label: 'Pago proveedores', icon: CreditCard },
    { href: '/contabilidad/conciliacion-costos', label: 'Conciliar costos DIAN', icon: FileCheck },
    { href: '/contabilidad/libro-diario',      label: 'Libro diario',     icon: BookOpen },
    { href: '/contabilidad/libro-mayor',       label: 'Libro mayor',      icon: BookText },
    { href: '/contabilidad/balance-comprobacion', label: 'Balance compr.', icon: Scale },
    { href: '/contabilidad/estado-situacion',  label: 'Estado situación', icon: Building },
    { href: '/contabilidad/estado-resultados', label: 'Estado resultados (ERI)', icon: TrendingUp },
    { href: '/contabilidad/cierre-periodo',    label: 'Cierre de periodo', icon: Lock },
    { href: '/contabilidad/exogena-consulta',  label: 'Exógena (consulta)', icon: FileSpreadsheet },
    { href: '/impuesto',                       label: 'Impuesto SIMPLE',  icon: Receipt },
    { href: '/reportes',                       label: 'Estado result. (op.)', icon: BarChart3, badge: 'legacy' },
  ] },
]

const allHrefs = sections.flatMap(s => s.items.map(i => i.href))

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  if (!pathname.startsWith(href)) return false
  return !allHrefs.some(h => h !== href && h.startsWith(href + '/') && pathname.startsWith(h))
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="group h-screen bg-[#0F172A] flex flex-col overflow-hidden
                 w-56 lg:w-14 lg:hover:w-56 transition-[width] duration-200 ease-in-out"
    >
      {/* Brand */}
      <div className="flex items-center h-14 px-4 border-b border-white/10 shrink-0">
        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
          <Truck size={14} className="text-white" />
        </div>
        <div className="ml-3 min-w-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-white font-bold text-sm whitespace-nowrap leading-tight">ISADAN Transportes</p>
          <p className="text-white/40 text-[10px] whitespace-nowrap">Gestión operativa</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        {sections.map((section, si) => (
          <div key={section.title ?? `s${si}`} className={si > 0 ? 'mt-3' : ''}>
            {section.title && (
              <p className="h-5 px-2.5 flex items-center text-[10px] font-semibold uppercase tracking-wider text-white/30 whitespace-nowrap
                            lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                {section.title}
              </p>
            )}
            {section.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(href, pathname)
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={`flex items-center h-9 px-2.5 rounded-lg mb-0.5 transition-colors
                    ${active
                      ? 'bg-blue-600/25 text-blue-400 font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="ml-3 text-sm whitespace-nowrap lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5">
                    {label}
                    {badge && (
                      <span className="text-[9px] font-medium uppercase tracking-wide text-amber-300/70 bg-amber-400/10 px-1 py-px rounded">
                        {badge}
                      </span>
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
