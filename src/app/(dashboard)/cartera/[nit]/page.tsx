import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import { formatCOP } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const money = (v: number) => (Math.abs(v) < 0.5 ? '—' : formatCOP(v))

type Mov = {
  fecha: string
  comprobante: string
  descripcion: string
  soporte: string
  debito: number
  credito: number
  saldo: number          // acumulado en la naturaleza de la cuenta
}

// Movimientos de un cliente en una cuenta, en orden cronológico, con saldo acumulado.
// natural = +1 si el saldo crece con el débito (activo 13050501), −1 si crece con el crédito (pasivo 28050510).
function conSaldo(rows: any[], natural: 1 | -1): Mov[] {
  let acum = 0
  return rows
    .sort((a, b) =>
      String(a.journal_entries.fecha).localeCompare(String(b.journal_entries.fecha)) ||
      Number(a.journal_entries.consecutivo) - Number(b.journal_entries.consecutivo))
    .map(r => {
      const debito = Number(r.debito ?? 0), credito = Number(r.credito ?? 0)
      acum += natural * (debito - credito)
      return {
        fecha:       r.journal_entries.fecha as string,
        comprobante: `${r.journal_entries.tipo_comprobante}-${r.journal_entries.consecutivo}`,
        descripcion: (r.journal_entries.descripcion ?? '') as string,
        soporte:     (r.journal_entries.documento_soporte ?? '') as string,
        debito, credito, saldo: acum,
      }
    })
}

function Tabla({ titulo, ayuda, movs }: { titulo: string; ayuda: string; movs: Mov[] }) {
  const saldo = movs.length ? movs[movs.length - 1].saldo : 0
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-4 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">{titulo}</h2>
          <p className="text-xs text-[#64748B] mt-0.5">{ayuda}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-[#64748B]">Saldo</p>
          <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatCOP(saldo)}</p>
        </div>
      </div>
      {movs.length === 0 ? (
        <p className="p-6 text-sm text-[#64748B] text-center">Sin movimientos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-xs font-semibold text-[#374151] uppercase tracking-wide">
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-4">Comprobante</th>
                <th className="py-2.5 px-4">Descripción</th>
                <th className="py-2.5 px-4 text-right">Débito</th>
                <th className="py-2.5 px-4 text-right">Crédito</th>
                <th className="py-2.5 px-4 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {movs.map((m, i) => (
                <tr key={i} className="hover:bg-[#F8FAFC]">
                  <td className="py-2 px-4 whitespace-nowrap text-[#64748B]">{m.fecha}</td>
                  <td className="py-2 px-4 whitespace-nowrap font-mono text-xs text-[#0F172A]">{m.comprobante}</td>
                  <td className="py-2 px-4 text-[#0F172A] max-w-md">
                    <span className="line-clamp-2">{m.descripcion}</span>
                    {m.soporte && <span className="text-xs text-[#64748B]">Soporte: {m.soporte}</span>}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-[#0F172A]">{money(m.debito)}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[#0F172A]">{money(m.credito)}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium text-[#0F172A]">{money(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default async function CarteraClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ nit: string }>
  searchParams: Promise<{ año?: string }>
}) {
  const { nit: nitParam } = await params
  const sp = await searchParams
  const nit = decodeURIComponent(nitParam)

  const { data: tercero } = await supabase
    .from('terceros')
    .select('id, numero_identificacion, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona')
    .eq('numero_identificacion', nit)
    .is('merged_into', null)
    .maybeSingle()
  if (!tercero) notFound()

  const rows = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('cuenta_puc, debito, credito, journal_entries!inner(estado, fecha, tipo_comprobante, consecutivo, descripcion, documento_soporte)')
    .eq('tercero_id', tercero.id)
    .in('cuenta_puc', ['28050510', '13050501'])
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))

  const anticipos = conSaldo(rows.filter(r => r.cuenta_puc === '28050510'), -1)
  const cartera   = conSaldo(rows.filter(r => r.cuenta_puc === '13050501'), 1)
  const volver    = sp.año ? `/cartera?año=${encodeURIComponent(sp.año)}` : '/cartera'

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={volver} className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors">
          <ChevronLeft size={16} /> Cartera
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-sm text-[#0F172A] font-medium">{nombreTercero(tercero)}</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-[#0F172A]">{nombreTercero(tercero)}</h1>
        <p className="text-xs text-[#64748B] mt-0.5 font-mono">NIT {tercero.numero_identificacion}</p>
      </div>

      <Tabla
        titulo="Anticipos recibidos (28050510)"
        ayuda="Crédito = el cliente consignó (recibo RC). Débito = se aplicó a una factura (cruce CX)."
        movs={anticipos}
      />
      <Tabla
        titulo="Facturado y cartera (13050501)"
        ayuda="Débito = FE verificada (CF). Crédito = cruce con anticipo (CX) o nota crédito (NC)."
        movs={cartera}
      />
    </div>
  )
}
