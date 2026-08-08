'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { parseXlsx, mapDian, type DianRow } from '@/lib/dian-xlsx'
import { postearCostoDianAction, importarDianConciliacionAction, type CostoResultado, type DianImportResult } from './actions'
import { Upload, CheckCircle, FileSpreadsheet, RefreshCw } from 'lucide-react'

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
        {sinClasificar && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
            ⚠ Tercero sin clasificar — asigna cuenta
          </div>
        )}
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

function ImportDian({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<DianRow[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<DianImportResult | null>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name); setRes(null)
    setRows((await parseXlsx(file)).map(mapDian))
  }
  const importar = async () => {
    setLoading(true)
    const r = await importarDianConciliacionAction(rows)
    setRes(r); setLoading(false)
    if (r.ok) onImported()
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#0F172A]">Subir reporte DIAN (.xlsx)</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Facturas recibidas del mes. Filtra receptor ISADAN, excluye acuses y notas crédito,
            evita duplicados por CUFE y resuelve/crea el proveedor por NIT.
          </p>
        </div>
        <label className="cursor-pointer shrink-0">
          <span className="inline-flex items-center gap-1.5 border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-medium px-3 py-2 rounded-lg">
            <FileSpreadsheet size={14} /> {fileName || 'Elegir archivo'}
            {rows.length > 0 && <span className="text-[#2563EB] font-semibold">· {rows.length} filas</span>}
          </span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
        </label>
        <button onClick={importar} disabled={!rows.length || loading}
          className="inline-flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg shrink-0">
          {loading ? <><RefreshCw size={13} className="animate-spin" /> Importando…</> : <><Upload size={13} /> Importar</>}
        </button>
      </div>

      {res && !res.ok && (
        <p className="text-xs text-red-600 mt-3 bg-red-50 rounded-lg px-3 py-2">Error: {res.error}</p>
      )}
      {res && res.ok && (
        <div className="mt-3 text-xs bg-[#F8FAFC] rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircle size={13} /> {res.insertados} importadas
            {res.duplicados > 0 ? ` · ${res.duplicados} duplicadas` : ''}
            {res.omitidos > 0 ? ` · ${res.omitidos} omitidas (no-recibido/acuse/NC)` : ''}
          </p>
          {res.tercerosNuevos.length > 0 && (
            <div className="text-amber-700">
              <span className="font-semibold">{res.tercerosNuevos.length} tercero(s) nuevo(s) creado(s)</span> — revisa su clasificación:
              <ul className="mt-0.5 list-disc list-inside text-[#64748B]">
                {res.tercerosNuevos.map((t, i) => (
                  <li key={i}>{t.nombre} ({t.nit}){t.warning ? ` · ⚠ ${t.warning}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {res.revisar.length > 0 && (
            <div className="text-red-600">
              <span className="font-semibold">{res.revisar.length} factura(s) con NIT no reconocido</span> — se importaron sin tercero, resuélvelas manual:
              <ul className="mt-0.5 list-disc list-inside">
                {res.revisar.map((r, i) => <li key={i}>FE {r.folio} · {r.nombre} ({r.nit})</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
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
      <ImportDian onImported={() => router.refresh()} />

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
