'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',                    label: 'Dashboard' },
  { href: '/viajes',              label: 'Viajes' },
  { href: '/legalizaciones',      label: 'Legalizaciones' },
  { href: '/bancos',              label: 'Bancos' },
  { href: '/bancos/conciliacion', label: 'Conciliación' },
  { href: '/facturas',            label: 'Facturación DIAN' },
  { href: '/proveedores',         label: 'Proveedores' },
  { href: '/prestamos',           label: 'Préstamos' },
  { href: '/prestaciones',        label: 'Prestaciones' },
  { href: '/nomina',              label: 'Nómina' },
  { href: '/vehiculos',           label: 'Vehículos' },
  { href: '/conductores',         label: 'Conductores' },
  { href: '/clientes',            label: 'Clientes' },
  { href: '/documentos',          label: 'Documentos' },
  { href: '/cartera',             label: 'Cartera' },
  { href: '/reportes',            label: 'Estado resultados' },
  { href: '/impuesto',            label: 'Impuesto SIMPLE' },
]

const allHrefs = links.map(l => l.href)

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  if (!pathname.startsWith(href)) return false
  // Yield to a more-specific sibling link when it also matches
  return !allHrefs.some(h => h !== href && h.startsWith(href + '/') && pathname.startsWith(h))
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-[#0F172A] flex flex-col h-screen flex-shrink-0">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="text-white font-bold text-sm">ISADAN Transportes</p>
        <p className="text-white/40 text-xs mt-0.5">Gestión operativa</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-2 py-2 rounded-lg text-sm mb-0.5 transition-colors
              ${isActive(href, pathname)
                ? 'bg-blue-600/25 text-blue-400 font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
