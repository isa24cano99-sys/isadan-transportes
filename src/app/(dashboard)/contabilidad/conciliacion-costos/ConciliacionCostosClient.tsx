'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearCostoDianAction, type CostoResultado } from './actions'

export type CuentaCosto = { codigo: string; nombre: string }
export type ItemCosto = {
  id: string
  emisor: string
  folio: string
  fecha: string
  monto: number
  terceroId: string | null
  cuentaSugerida: string | null
  tratamiento: 'a' | 'c'
}

function Fila({ it, cuentas, onDone }: { it: ItemCosto; cuentas: CuentaCosto[]; onDone: (r: CostoResultado) => void }) {
  const [cuenta, setCuenta] = useState(it.cuentaSugerida ?? '')
  const [trat, setTrat] = useState<'a' | 'c'>(it.tratamiento)
  const [loading, setLoading] = useState(false)
  const sinClasificar = !it.cuentaSugerida
  const fijaraFuturo = sinClasificar && !!cuenta   // el tercero no tenía sugerida y se está eligiendo → se guardará

  const contabilizar = async () => {
    if (!cuenta || loading) return
    setLoading(true)
    const res = await postearCostoDianAction({
      importId: it.id, terceroId: it.terceroId, cuentaPuc: cuenta, tratamiento: trat,
      ref: `${it.emisor} · FE ${it.folio}`,
    })
    setLoading(false)
    onDone(res)
  }

  const selCls = 'border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-xs bg-white text-[#0F172A]'

  return (
    <tr className="border-b border-[#E2E8F0] last:border-0 align-top">
      <td className="px-3 py-2.5 text-[#64748B] whitespace-nowrap">{it.fecha}</td>
      <td className="px-3 py-2.5">
        <div className="text-[#0F172A]">{it.emisor}</div>
        <div className="text-xs text-[#94A3B8]">FE {it.folio}</div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(it.monto)}</td>
      <td className="px-3 py-2.5">
        <select value={cuenta} onChange={e => setCuenta(e.target.value)} className={selCls}>
          <option value="">{sinClasificar ? '— Tercero sin clasificar —' : 'Elegir cuenta…'}</option>
          {cuentas.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
        </select>
        {it.cuentaSugerida && <div className="text-[10px] text-emerald-600 mt-0.5">Sugerido del proveedor · editable</div>}
        {fijaraFuturo && <div className="text-[10px] text-amber-700 mt-0.5">⚠ Se fija como cuenta de este proveedor para el futuro</div>}
      </td>
      <td className="px-3 py-2.5">
        <select value={trat} onChange={e => setTrat(e.target.value as 'a' | 'c')} className={selCls}>
          <option value="c">Causación (CR proveedor)</option>
          <option value="a">Pago directo (CR banco)</option>
        </select>
      </td>
      <td className="px-3 py-2.5 text-right">
        <button onClick={contabilizar} disabled={!cuenta || loading}
          className="text-xs text-[#2563EB] hover:underline font-medium disabled:opacity-40 disabled:no-underline">
          {loading ? '…' : 'Contabilizar'}
        </button>
      </td>
    </tr>
  )
}

export default function ConciliacionCostosClient({ items, cuentas }: { items: ItemCosto[]; cuentas: CuentaCosto[] }) {
  const router = useRouter()
  const [resultados, setResultados] = useState<CostoResultado[]>([])

  const onDone = (r: CostoResultado) => {
    setResultados(p => [r, ...p.filter(x => x.id !== r.id)])
    if (r.ok) setTimeout(() => router.refresh(), 600)
  }

  const total = items.reduce((s, i) => s + i.monto, 0)

  return (
    <div className="space-y-4">
      {resultados.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-[#64748B] mb-1">Resultado</p>
          {resultados.map(r => (
            <p key={r.id} className={`text-sm flex items-start gap-2 ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className="font-semibold shrink-0">{r.ref}</span>
              <span>{r.ok ? '✓' : '✗'} {r.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay costos de proveedores DIAN pendientes de contabilizar.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-3 py-2">Fecha</th>
                  <th className="text-left font-medium px-3 py-2">Proveedor</th>
                  <th className="text-right font-medium px-3 py-2">Monto</th>
                  <th className="text-left font-medium px-3 py-2">Cuenta de costo</th>
                  <th className="text-left font-medium px-3 py-2">Tratamiento</th>
                  <th className="w-24 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => <Fila key={it.id} it={it} cuentas={cuentas} onDone={onDone} />)}
              </tbody>
              <tfoot>
                <tr className="bg-[#F8FAFC] font-semibold border-t-2 border-[#E2E8F0]">
                  <td className="px-3 py-2.5 text-xs text-[#64748B]" colSpan={2}>{items.length} factura(s)</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#0F172A] whitespace-nowrap">{formatCOP(total)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
