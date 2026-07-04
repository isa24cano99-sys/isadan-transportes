import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react'

async function getStats() {
  const [
    { count: totalDian },
    { count: cruzadas },
    { count: totalPeajes },
  ] = await Promise.all([
    supabase.from('dian_invoices_import').select('*', { count: 'exact', head: true }),
    supabase.from('dian_invoices_import').select('*', { count: 'exact', head: true })
      .not('matched_toll_id', 'is', null),
    supabase.from('toll_transactions').select('*', { count: 'exact', head: true }),
  ])

  const sinCruzar = (totalDian ?? 0) - (cruzadas ?? 0)

  return {
    totalDian:   totalDian  ?? 0,
    cruzadas:    cruzadas   ?? 0,
    sinCruzar,
    totalPeajes: totalPeajes ?? 0,
  }
}

export default async function FacturasPage() {
  const stats = await getStats()

  const cards = [
    {
      label: 'Facturas DIAN importadas',
      value: stats.totalDian,
      icon: FileText,
      color: 'text-[#2563EB]',
      bg:    'bg-blue-50',
    },
    {
      label: 'Cruzadas con peaje Flypass',
      value: stats.cruzadas,
      icon: CheckCircle,
      color: 'text-green-700',
      bg:    'bg-green-50',
    },
    {
      label: 'Sin cruzar / sin clasificar',
      value: stats.sinCruzar,
      icon: AlertTriangle,
      color: stats.sinCruzar > 0 ? 'text-yellow-700' : 'text-green-700',
      bg:    stats.sinCruzar > 0 ? 'bg-yellow-50'    : 'bg-green-50',
    },
    {
      label: 'Peajes Flypass importados',
      value: stats.totalPeajes,
      icon: Upload,
      color: 'text-[#2563EB]',
      bg:    'bg-blue-50',
    },
  ]

  const accesos = [
    {
      href:        '/facturas/importar',
      title:       'Importar DIAN / Flypass',
      description: 'Carga el reporte Flypass y el reporte DIAN para cruzar facturas de peajes automáticamente.',
      icon:        Upload,
      primary:     true,
    },
    {
      href:        '/facturas/importar',
      title:       'Ver facturas importadas',
      description: `${stats.totalDian} facturas DIAN · ${stats.totalPeajes} peajes · ${stats.cruzadas} cruzados.`,
      icon:        FileText,
      primary:     false,
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Facturación DIAN</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Importa, cruza y revisa las facturas electrónicas de peajes y otros proveedores.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${bg} mb-3`}>
              <Icon size={16} className={color} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('es-CO')}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Access cards */}
      <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-3">Accesos rápidos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accesos.map(({ href, title, description, icon: Icon, primary }) => (
          <Link
            key={href + title}
            href={href}
            className={`group flex items-start gap-4 p-5 rounded-xl border transition-all ${
              primary
                ? 'bg-[#2563EB] border-[#2563EB] hover:bg-[#1D4ED8] text-white'
                : 'bg-white border-[#E2E8F0] hover:border-[#2563EB]/30 hover:shadow-sm'
            }`}
          >
            <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              primary ? 'bg-white/20' : 'bg-[#F1F5F9]'
            }`}>
              <Icon size={18} className={primary ? 'text-white' : 'text-[#2563EB]'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${primary ? 'text-white' : 'text-[#0F172A]'}`}>{title}</p>
              <p className={`text-xs mt-0.5 ${primary ? 'text-white/70' : 'text-[#94A3B8]'}`}>{description}</p>
            </div>
            <ArrowRight size={16} className={`flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5 ${
              primary ? 'text-white/70' : 'text-[#94A3B8]'
            }`} />
          </Link>
        ))}
      </div>
    </div>
  )
}
