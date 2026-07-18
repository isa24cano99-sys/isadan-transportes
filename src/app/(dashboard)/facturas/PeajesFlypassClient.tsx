'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, RefreshCw, CheckCircle2, Minus, Clock } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { importarFlypassPeajesAction, type GrupoPeaje, type FlypassResult } from './peajes-actions'

const ESTADO_BADGE: Record<GrupoPeaje['estado'], { label: string; cls: string }> = {
  creado:          { label: 'Creado',          cls: 'bg-green-100 text-green-800' },
  omitido:         { label: 'Omitido (dup.)',  cls: 'bg-gray-100 text-gray-600' },
  'fuera-de-rango':{ label: 'Fuera de rango',  cls: 'bg-yellow-100 text-yellow-800' },
}

export default function PeajesFlypassClient() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]   = useState('')
  const [fechaInicio, setFecha]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [result, setResult]       = useState<FlypassResult | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setFileName(file?.name ?? '')
  }

  const handleSubmit = async () => {
    const file = fileInputRef.current?.files?.[0]
    // Validación antes de enviar al servidor
    if (!file) { setMsg({ type: 'err', text: 'Selecciona el archivo Excel de Flypass.' }); return }
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setMsg({ type: 'err', text: 'El archivo debe ser un Excel (.xlsx / .xls).' }); return
    }
    if (!fechaInicio) { setMsg({ type: 'err', text: 'Elige la fecha "Registrar en bancos desde".' }); return }

    setLoading(true)
    setMsg(null)
    setResult(null)
    const res = await importarFlypassPeajesAction(file, fechaInicio)
    setLoading(false)
    if (!res.ok) {
      setMsg({ type: 'err', text: res.error ?? 'Error al procesar el reporte.' })
      return
    }
    setResult(res)
    setMsg({
      type: 'ok',
      text: `${res.bankCreated} transacción${res.bankCreated !== 1 ? 'es' : ''} creada${res.bankCreated !== 1 ? 's' : ''} en bancos · ${res.bankSkipped} omitida${res.bankSkipped !== 1 ? 's' : ''} por duplicado`,
    })
    setTimeout(() => router.refresh(), 1000)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[#0F172A]">Peajes Flypass</h2>
        <p className="text-xs text-[#64748B] mt-0.5">
          Sube el reporte Flypass y registra los peajes como egresos en bancos (agrupados por placa y día).
        </p>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          {/* Archivo */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Reporte Flypass (.xlsx)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="block w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#F1F5F9] file:text-[#0F172A] hover:file:bg-[#E2E8F0] file:cursor-pointer"
            />
          </div>

          {/* Fecha desde */}
          <div className="w-full md:w-52">
            <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Registrar en bancos desde:</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>

          {/* Botón */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px] whitespace-nowrap"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            {loading ? 'Procesando…' : 'Subir y registrar'}
          </button>
        </div>

        {fileName && <p className="text-xs text-[#94A3B8] mt-2">Archivo: {fileName}</p>}

        {msg && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-lg font-medium ${
            msg.type === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Resultado: resumen + tabla agrupada */}
      {result && result.grouped.length > 0 && (
        <div className="space-y-4">
          {/* Resumen de lo importado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Peajes importados', value: String(result.totalPeajes) },
              {
                label: 'Período',
                value: result.periodoInicio
                  ? (result.periodoInicio === result.periodoFin
                      ? result.periodoInicio
                      : `${result.periodoInicio} → ${result.periodoFin}`)
                  : '—',
              },
              { label: 'Total COP', value: formatCOP(result.totalCOP) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                <p className="text-xs text-[#64748B]">{label}</p>
                <p className="text-base font-bold text-[#0F172A] tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Resumen de transacciones creadas en bancos */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Bancos</span>
            <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={12} /> {result.bankCreated} transacción{result.bankCreated !== 1 ? 'es' : ''} nueva{result.bankCreated !== 1 ? 's' : ''}</span>
            <span className="inline-flex items-center gap-1 text-xs text-[#64748B]"><Minus size={12} /> {result.bankSkipped} omitida{result.bankSkipped !== 1 ? 's' : ''} por duplicado</span>
            <span className="text-xs text-[#94A3B8]">
              · peajes guardados: {result.tollsInserted} nuevos, {result.tollDuplicates} ya existentes
              {result.accountName ? ` · cuenta: ${result.accountName}` : ''}
            </span>
          </div>

          {/* Tabla de peajes agrupados por placa y día */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#0F172A]">Peajes por placa y día</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Placa</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Cantidad de peajes</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Total COP del día</th>
                    <th className="text-center py-2.5 px-4 font-semibold text-[#374151] text-xs uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {result.grouped.map(g => {
                    const badge = ESTADO_BADGE[g.estado]
                    return (
                      <tr key={`${g.plate}_${g.fecha}`} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#0F172A]">{g.plate}</td>
                        <td className="py-2.5 px-4 text-[#64748B]">{g.fecha}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-[#64748B]">{g.count}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-[#0F172A]">{formatCOP(g.total)}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && result.grouped.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-[#94A3B8] px-1">
          <Clock size={12} /> El reporte no tenía peajes con fecha válida para agrupar.
        </div>
      )}
    </section>
  )
}
