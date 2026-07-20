'use client'

import { useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, RefreshCw, Minus, CheckCircle2 } from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import { importarFlypassAction, type FlypassImportResult } from '../peajes-actions'
import { useUrlState } from '@/lib/useUrlState'

export type TollRow = {
  id:        string
  plate:     string | null
  pass_date: string | null
  toll_name: string | null
  total:     number
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function PeajesMesClient({ tolls }: { tolls: TollRow[] }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const now = new Date()
  const [fileName, setFileName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [mes,  setMes]  = useUrlState('mes',  String(now.getMonth() + 1))
  const [anio, setAnio] = useUrlState('anio', String(now.getFullYear()))

  const anios = useMemo(() => {
    const set = new Set<number>()
    for (const t of tolls) if (t.pass_date) set.add(new Date(t.pass_date).getFullYear())
    if (set.size === 0) set.add(now.getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [tolls, now])

  const filtered = useMemo(() => tolls.filter(t => {
    if (!t.pass_date) return false
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
    return Array.from(map.entries()).map(([plate, s]) => ({ plate, ...s })).sort((a, b) => b.total - a.total)
  }, [filtered])

  const detalle = useMemo(() =>
    [...filtered].sort((a, b) => (b.pass_date ?? '').localeCompare(a.pass_date ?? '')),
  [filtered])

  const totalCount = porPlaca.reduce((s, r) => s + r.count, 0)
  const totalMonto = porPlaca.reduce((s, r) => s + r.total, 0)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => setFileName(e.target.files?.[0]?.name ?? '')

  const handleSubmit = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) { setMsg({ type: 'err', text: 'Selecciona el archivo Excel de Flypass.' }); return }
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setMsg({ type: 'err', text: 'El archivo debe ser un Excel (.xlsx / .xls).' }); return
    }
    setLoading(true); setMsg(null)
    const res: FlypassImportResult = await importarFlypassAction(file)
    setLoading(false)
    if (!res.ok) { setMsg({ type: 'err', text: res.error ?? 'Error al procesar el reporte.' }); return }
    setMsg({
      type: 'ok',
      text: `${res.inserted} peaje${res.inserted !== 1 ? 's' : ''} nuevo${res.inserted !== 1 ? 's' : ''} · ${res.duplicates} ya existente${res.duplicates !== 1 ? 's' : ''}` +
            (res.periodoInicio ? ` · ${res.periodoInicio} → ${res.periodoFin}` : ''),
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
    setFileName('')
    setTimeout(() => router.refresh(), 800)
  }

  return (
    <div className="space-y-6">
      {/* Subir archivo del mes */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <h2 className="text-base font-semibold text-[#0F172A]">Subir reporte del mes</h2>
        <p className="text-xs text-[#64748B] mt-0.5 mb-3">
          Se guardan los peajes en el sistema (sin crear transacciones en bancos). Subir el mismo mes de nuevo no duplica.
        </p>
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Reporte Flypass (.xlsx)</label>
            <input
              ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile}
              className="block w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#F1F5F9] file:text-[#0F172A] hover:file:bg-[#E2E8F0] file:cursor-pointer"
            />
          </div>
          <button
            onClick={handleSubmit} disabled={loading}
            className="flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px] whitespace-nowrap"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            {loading ? 'Procesando…' : 'Subir peajes'}
          </button>
        </div>
        {fileName && <p className="text-xs text-[#94A3B8] mt-2">Archivo: {fileName}</p>}
        {msg && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
            msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {msg.type === 'ok' && <CheckCircle2 size={13} />}{msg.text}
          </div>
        )}
      </div>

      {/* Filtro mes/año */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Peajes importados</h2>
          <p className="text-xs text-[#64748B] mt-0.5">{filtered.length} peaje{filtered.length !== 1 ? 's' : ''} en el período</p>
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

      {porPlaca.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Minus size={20} className="text-[#94A3B8]" />
          </div>
          <p className="text-sm font-medium text-[#0F172A]">Sin peajes en el período seleccionado</p>
        </div>
      ) : (
        <>
          {/* Desglose por placa */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0]"><span className="text-sm font-semibold text-[#0F172A]">Desglose por placa</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Placa</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cantidad</th>
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

          {/* Detalle */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0]"><span className="text-sm font-semibold text-[#0F172A]">Detalle de peajes</span></div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Placa</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Peaje</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {detalle.map(t => (
                    <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2 px-4 text-[#64748B] whitespace-nowrap">{t.pass_date ? formatDate(t.pass_date.slice(0, 10)) : '—'}</td>
                      <td className="py-2 px-4 font-mono font-semibold text-[#0F172A]">{t.plate ?? '—'}</td>
                      <td className="py-2 px-4 text-[#0F172A]">{t.toll_name || '—'}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-[#0F172A]">{formatCOP(Number(t.total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
