'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Route, ClipboardCheck, Landmark, GitMerge, FileText,
  Building2, HandCoins, PiggyBank, Users, Truck, User, Contact, Folder,
  Wallet, BarChart3, Receipt, IdCard, Calculator, FileCheck, Banknote, type LucideIcon,
} from 'lucide-react'

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/',                    label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/viajes',              label: 'Viajes',           icon: Route },
  { href: '/legalizaciones',      label: 'Legalizaciones',   icon: ClipboardCheck },
  { href: '/bancos',              label: 'Bancos',           icon: Landmark },
  { href: '/bancos/conciliacion', label: 'Conciliación',     icon: GitMerge },
  { href: '/facturas',            label: 'Facturación',      icon: FileText },
  { href: '/proveedores',         label: 'Proveedores',      icon: Building2 },
  { href: '/prestamos',           label: 'Préstamos',        icon: HandCoins },
  { href: '/prestaciones',        label: 'Prestaciones',     icon: PiggyBank },
  { href: '/nomina',              label: 'Nómina',           icon: Users },
  { href: '/vehiculos',           label: 'Vehículos',        icon: Truck },
  { href: '/conductores',         label: 'Conductores',      icon: User },
  { href: '/clientes',            label: 'Clientes',         icon: Contact },
  { href: '/terceros',            label: 'Terceros',         icon: IdCard },
  { href: '/documentos',          label: 'Documentos',       icon: Folder },
  { href: '/cartera',             label: 'Cartera',          icon: Wallet },
  { href: '/contabilidad/causaciones',     label: 'Causaciones',   icon: Calculator },
  { href: '/contabilidad/emision-facturas', label: 'Emisión FEIT',  icon: FileCheck },
  { href: '/contabilidad/recibos-anticipo', label: 'Recibos anticipo', icon: Banknote },
  { href: '/reportes',            label: 'Estado resultados', icon: BarChart3 },
  { href: '/impuesto',            label: 'Impuesto SIMPLE',  icon: Receipt },
]

const allHrefs = links.map(l => l.href)

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
        {links.map(({ href, label, icon: Icon }) => {
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
              <span className="ml-3 text-sm whitespace-nowrap lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
