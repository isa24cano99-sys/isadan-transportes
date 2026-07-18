'use client'

import { useState, useMemo } from 'react'
import { Minus } from 'lucide-react'
import { formatCOP } from '@/lib/utils'

export type TollLite = {
  id:        string
  plate:     string | null
  pass_date: string | null
  total:     number
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function PeajesImportadosClient({ tolls }: { tolls: TollLite[] }) {
  const [mes,  setMes]  = useState('')
  const [anio, setAnio] = useState('')

  const filtered = useMemo(() => tolls.filter(t => {
    if (!t.pass_date) return true
    const d = new Date(t.pass_date)
    if (mes  && d.getMonth() + 1 !== parseInt(mes, 10))  return false
    if (anio && d.getFullYear()   !== parseInt(anio, 10)) return false
    return true
  }), [tolls, mes, anio])

  const porPlaca = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const t of filtered) {
      const plate = (t.plate || '—').trim().toUpperCase()
      const cur = map.get(plate) ?? { count: 0, total: 0 }
      map.set(plate, { count: cur.count + 1, total: cur.total + Number(t.total ?? 0) })
    }
    return Array.from(map.entries())
      .map(([plate, s]) => ({ plate, ...s }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const totalCount = porPlaca.reduce((s, r) => s + r.count, 0)
  const totalMonto = porPlaca.reduce((s, r) => s + r.total, 0)

  const anios = useMemo(() => {
    const set = new Set<number>()
    for (const t of tolls) if (t.pass_date) set.add(new Date(t.pass_date).getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [tolls])

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Peajes ya importados</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Resumen por placa · {filtered.length}{filtered.length !== tolls.length ? ` de ${tolls.length}` : ''} peajes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-[#64748B]">
            <option value="">Todos los años</option>
            {anios.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
      </div>

      {porPlaca.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Placa</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cantidad de peajes</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Total COP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {porPlaca.map(({ plate, count, total }) => (
                  <tr key={plate} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-[#0F172A]">{plate}</td>
                    <td className="py-2.5 px-4 text-right text-[#64748B]">{count}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-[#0F172A] tabular-nums">{formatCOP(total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#F1F5F9] border-t-2 border-[#CBD5E1]">
                  <td className="py-2.5 px-4 text-xs font-bold text-[#0F172A]">Total</td>
                  <td className="py-2.5 px-4 text-right text-xs font-bold text-[#0F172A]">{totalCount}</td>
                  <td className="py-2.5 px-4 text-right text-xs font-bold text-[#0F172A] tabular-nums">{formatCOP(totalMonto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Minus size={20} className="text-[#94A3B8]" />
          </div>
          <p className="text-sm font-medium text-[#0F172A]">Sin peajes importados en el período</p>
        </div>
      )}
    </section>
  )
}
