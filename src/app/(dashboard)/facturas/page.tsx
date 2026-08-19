import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import Link from 'next/link'
import { FileText, Inbox, ArrowRight } from 'lucide-react'
import { formatCOP } from '@/lib/utils'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [invRows, dianRes] = await Promise.all([
    fetchAll<any>((f, t) => supabase.from('invoices').select('total_amount, dian_status, credit_note_id, credit_note_number').eq('invoice_type', 'EMITIDA').order('id', { ascending: true }).range(f, t)),
    supabase.from('dian_invoices_import').select('id', { count: 'exact', head: true }),
  ])

  // Excluir facturas anuladas (dian_status ANULADA o con nota crédito) del total facturado
  const facturas = (invRows as any[])
    .filter(f => !(f.dian_status === 'ANULADA' || f.credit_note_id || f.credit_note_number))
  const totalFacturado = facturas.reduce((s, f) => s + Number(f.total_amount ?? 0), 0)

  return {
    facturasCount:  facturas.length,
    totalFacturado,
    dianCount:      dianRes.count ?? 0,
  }
}

export default async function FacturacionPage() {
  const s = await getStats()

  const cards = [
    {
      href: '/facturas/clientes',
      icon: FileText,
      accent: 'bg-blue-50 text-blue-600',
      title: 'Facturas clientes',
      desc: 'Facturas FEIT emitidas · importar Excel Dataico',
      stats: [
        { label: 'Total facturado', value: formatCOP(s.totalFacturado) },
        { label: 'Facturas', value: String(s.facturasCount) },
      ],
    },
    {
      href: '/contabilidad/conciliacion-costos',
      icon: Inbox,
      accent: 'bg-amber-50 text-amber-600',
      title: 'Importar DIAN (recibidas + emitidas)',
      desc: 'Un solo archivo del mes, ambas direcciones — en Conciliar costos',
      stats: [
        { label: 'En sistema', value: String(s.dianCount) },
      ],
    },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Facturación</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Facturas de clientes y facturas DIAN recibidas.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(({ href, icon: Icon, accent, title, desc, stats }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#2563EB]/40 hover:shadow-sm transition-all flex flex-col"
          >
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
                <Icon size={19} />
              </div>
              <ArrowRight size={16} className="text-[#CBD5E1] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all" />
            </div>
            <h2 className="text-base font-semibold text-[#0F172A] mt-4">{title}</h2>
            <p className="text-xs text-[#64748B] mt-0.5 flex-1">{desc}</p>
            <div className="flex gap-4 mt-4 pt-4 border-t border-[#F1F5F9]">
              {stats.map(st => (
                <div key={st.label}>
                  <p className="text-sm font-bold text-[#0F172A] tabular-nums">{st.value}</p>
                  <p className="text-[11px] text-[#94A3B8]">{st.label}</p>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
