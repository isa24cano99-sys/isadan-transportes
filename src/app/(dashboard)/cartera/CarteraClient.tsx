'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wallet, FileText, TrendingUp, Banknote, Search } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import type { ResumenCartera } from '@/lib/cartera-libro'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

type Filtro = 'TODOS' | 'ANTICIPO' | 'CARTERA'

const money = (v: number) => (Math.abs(v) < 0.5 ? '—' : formatCOP(v))

export default function CarteraClient({
  year, availableYears, resumen,
}: {
  year: number
  availableYears: number[]
  resumen: ResumenCartera
}) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('TODOS')
  const [busca, setBusca]   = useState('')

  // Solo se muestran los meses del año con facturación (cualquier cliente)
  const meses = useMemo(
    () => resumen.porMesTotal.map((v, m) => ({ m, v })).filter(x => Math.abs(x.v) >= 0.5).map(x => x.m),
    [resumen.porMesTotal],
  )

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return resumen.filas.filter(f => {
      if (filtro === 'ANTICIPO' && f.anticipoSaldo <= 0) return false
      if (filtro === 'CARTERA'  && f.carteraSaldo  <= 0) return false
      if (q && !(`${f.nombre} ${f.nit ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [resumen.filas, filtro, busca])

  const kpis = [
    { label: 'Anticipos de clientes',  value: resumen.anticipoTotal,  sub: 'Saldo en 28050510 sin aplicar', icon: Wallet,     cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Cartera facturada',      value: resumen.carteraTotal,   sub: 'Saldo en 13050501 por cobrar',  icon: FileText,   cls: 'text-yellow-600 bg-yellow-50' },
    { label: `Facturado ${year}`,      value: resumen.facturadoAnio,  sub: 'FE verificadas, neto de NC',    icon: TrendingUp, cls: 'text-[#2563EB] bg-blue-50' },
    { label: `Anticipos recibidos ${year}`, value: resumen.recibidoAnio, sub: 'Consignaciones (recibos RC)', icon: Banknote,   cls: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Cartera y anticipos de clientes</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Lo que dice el libro por cliente · {resumen.filas.length} cliente{resumen.filas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <select
          value={year}
          onChange={e => router.push(`/cartera?año=${e.target.value}`)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm font-medium text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, sub, icon: Icon, cls }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}><Icon size={15} /></div>
              <div className="min-w-0">
                <p className="text-base md:text-lg font-bold tabular-nums leading-tight text-[#0F172A]">{formatCOP(value)}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
                <p className="text-xs text-[#64748B]">{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 leading-relaxed">
        <span className="font-semibold text-[#0F172A]">Cómo se mueve:</span>{' '}
        el cliente consigna → <span className="font-medium">Recibos de anticipo</span> acredita 28050510.
        La FE verificada → <span className="font-medium">Facturación</span> debita 13050501 (el ingreso se reconoce ahí).
        <span className="font-medium"> Cruce de cartera</span> aplica el anticipo a la factura (DB 28050510 / CR 13050501).
        Esta pantalla solo muestra el resultado: para registrar algo, usa esas pantallas.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {([['TODOS', 'Todos'], ['ANTICIPO', 'Con anticipo'], ['CARTERA', 'Con cartera por cobrar']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtro === k ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#374151] hover:bg-[#E2E8F0]'
              }`}
            >{label}</button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente o NIT"
            className="w-full border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-1.5 text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {filas.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="text-left py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cliente</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Anticipo disponible</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cartera por cobrar</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Facturado {year}</th>
                  {meses.map(m => (
                    <th key={m} className="text-right py-3 px-3 font-semibold text-[#374151] text-xs uppercase tracking-wide">{MESES[m]}</th>
                  ))}
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filas.map(f => (
                  <tr key={f.clave} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#0F172A]">{f.nombre}</p>
                      <p className="text-xs text-[#64748B] font-mono">{f.nit ?? 'sin NIT'}</p>
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums ${f.anticipoSaldo > 0 ? 'font-semibold text-emerald-700' : f.anticipoSaldo < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                      {money(f.anticipoSaldo)}
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums ${f.carteraSaldo > 0 ? 'font-semibold text-yellow-700' : f.carteraSaldo < 0 ? 'text-red-600' : 'text-[#64748B]'}`}>
                      {money(f.carteraSaldo)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#0F172A]">{money(f.facturadoAnio)}</td>
                    {meses.map(m => (
                      <td key={m} className="py-3 px-3 text-right tabular-nums text-[#64748B]">{money(f.porMes[m])}</td>
                    ))}
                    <td className="py-3 px-4 text-right">
                      {f.nit && (
                        <Link href={`/cartera/${encodeURIComponent(f.nit)}?año=${year}`} className="text-xs font-medium text-[#2563EB] hover:underline">
                          Movimientos →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#F8FAFC] border-t border-[#E2E8F0] font-semibold text-[#0F172A]">
                  <td className="py-3 px-4">Total ({filas.length})</td>
                  <td className="py-3 px-4 text-right tabular-nums">{money(filas.reduce((s, f) => s + f.anticipoSaldo, 0))}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{money(filas.reduce((s, f) => s + f.carteraSaldo, 0))}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{money(filas.reduce((s, f) => s + f.facturadoAnio, 0))}</td>
                  {meses.map(m => (
                    <td key={m} className="py-3 px-3 text-right tabular-nums">{money(filas.reduce((s, f) => s + f.porMes[m], 0))}</td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-[#0F172A]">No hay clientes con ese filtro</p>
          <p className="text-xs text-[#64748B] mt-1">Cambia el filtro, la búsqueda o el año.</p>
        </div>
      )}
    </div>
  )
}
