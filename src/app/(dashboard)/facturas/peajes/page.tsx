import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import PeajesMesClient, { type TollRow } from './PeajesMesClient'

export const dynamic = 'force-dynamic'

async function getTolls(): Promise<TollRow[]> {
  const { data } = await supabase
    .from('toll_transactions')
    .select('id, plate, pass_date, toll_name, total')
    .order('pass_date', { ascending: false })
    .limit(10000)

  return ((data ?? []) as any[]).map(t => ({
    id:        t.id,
    plate:     t.plate ?? null,
    pass_date: t.pass_date ?? null,
    toll_name: t.toll_name ?? null,
    total:     Number(t.total ?? 0),
  }))
}

export default async function PeajesFlypassPage() {
  const tolls = await getTolls()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link href="/facturas" className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
        <ArrowLeft size={15} /> Facturación
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Peajes Flypass</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Sube el reporte mensual de Flypass y consulta el detalle por placa.</p>
      </div>

      <PeajesMesClient tolls={tolls} />
    </div>
  )
}
