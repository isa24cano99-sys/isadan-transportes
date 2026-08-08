import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import ImportarClient from './ImportarClient'

export default function ImportarPage() {
  return (
    <div>
      <div className="px-6 pt-6 flex items-center gap-3 mb-2">
        <Link
          href="/facturas"
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ChevronLeft size={16} /> Facturación DIAN
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">Importar archivos</span>
      </div>
      <ImportarClient />
    </div>
  )
}
