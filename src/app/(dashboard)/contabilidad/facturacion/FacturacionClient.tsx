'use client'

import { formatCOP, formatDate } from '@/lib/utils'
import { FileText } from 'lucide-react'
import type { EmitidaFE } from './actions'

export default function FacturacionClient({ emitidas }: { emitidas: EmitidaFE[] }) {
  if (emitidas.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
        <FileText size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
        <p className="text-sm text-[#64748B]">No hay facturas emitidas importadas todavía.</p>
        <p className="text-xs text-[#94A3B8] mt-1">
          Sube el reporte DIAN del mes en <strong>Conciliar costos DIAN</strong> — trae recibidas y emitidas en un solo archivo.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">FEIT</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Cliente</th>
            <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Total</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0]">
          {emitidas.map(e => {
            const anulada = /anul/i.test(e.status)
            return (
              <tr key={e.id} className="hover:bg-[#F8FAFC]">
                <td className="px-3 py-1.5 text-xs font-medium text-[#0F172A] whitespace-nowrap">{e.prefix}{e.folio}</td>
                <td className="px-3 py-1.5 text-xs text-[#64748B] whitespace-nowrap">{e.issue_date ? formatDate(e.issue_date) : '—'}</td>
                <td className="px-3 py-1.5 text-xs text-[#0F172A] max-w-[260px] truncate">{e.cliente}</td>
                <td className="px-3 py-1.5 text-xs text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(e.total)}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${anulada ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                    {e.status || '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-[#94A3B8] px-3 py-2 border-t border-[#F1F5F9]">
        El cruce con el viaje y el botón de contabilizar (DB 13050501 / CR 41450510) se agregan en el siguiente paso.
      </p>
    </div>
  )
}
