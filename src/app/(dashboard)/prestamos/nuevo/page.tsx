import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import NuevoPrestamoForm from './form'

export default function NuevoPrestamoPage() {
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/prestamos"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ChevronLeft size={16} />
          Préstamos
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">Nuevo préstamo</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nuevo préstamo</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Registra un crédito y genera la tabla de amortización automáticamente
        </p>
      </div>

      <NuevoPrestamoForm />
    </div>
  )
}
