'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { CheckCircle2, Info } from 'lucide-react'
import { getResumenSSAction, postearConsolidacionSSAction, type ResumenSS } from './actions'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function SeguridadSocialClient({
  initialYear, initialMonth, initialResumen,
}: { initialYear: number; initialMonth: number; initialResumen: ResumenSS }) {
  const router = useRouter()
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [resumen, setResumen] = useState<ResumenSS>(initialResumen)
  const [montoReal, setMontoReal] = useState('')
  const [loadingResumen, setLoadingResumen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  const periodo = `${year}-${String(month).padStart(2, '0')}`

  const recargar = async (y: number, m: number) => {
    setLoadingResumen(true); setResultado(null)
    const r = await getResumenSSAction(`${y}-${String(m).padStart(2, '0')}`)
    setResumen(r); setLoadingResumen(false)
  }
  const onMonth = (m: number) => { setMonth(m); recargar(year, m) }
  const onYear  = (y: number) => { setYear(y);  recargar(y, month) }

  const real   = montoReal.trim() === '' ? null : Number(montoReal) || 0
  const crValor = real ?? resumen.causado
  const ajuste  = real === null ? 0 : real - resumen.causado

  const consolidar = async () => {
    if (posting || resumen.causado <= 0 || resumen.yaConsolidado) return
    setPosting(true); setResultado(null)
    const res = await postearConsolidacionSSAction(periodo, real)
    setResultado(res); setPosting(false)
    if (res.ok) { setMontoReal(''); await recargar(year, month); router.refresh() }
  }

  const selCls = 'border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white'
  const puede = resumen.causado > 0 && !resumen.yaConsolidado && !loadingResumen

  return (
    <div className="space-y-4">
      {resultado && (
        <div className={`text-sm rounded-xl border p-4 ${resultado.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {resultado.ok ? '✓ ' : '✗ '}{resultado.mensaje}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        {/* Mes / Año */}
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-medium text-[#64748B]">Mes</span>
            <select className={selCls} value={month} onChange={e => onMonth(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 w-28">
            <span className="text-xs font-medium text-[#64748B]">Año</span>
            <select className={selCls} value={year} onChange={e => onYear(Number(e.target.value))}>
              {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        {loadingResumen ? (
          <p className="text-sm text-[#94A3B8] py-4 text-center">Cargando…</p>
        ) : resumen.yaConsolidado ? (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <span>El periodo <strong>{periodo}</strong> ya fue consolidado — asiento <strong>CG-{resumen.yaConsolidado.consecutivo}</strong>. No se puede consolidar dos veces (corrige por reversión si hace falta).</span>
          </div>
        ) : resumen.causado <= 0 ? (
          <div className="flex items-start gap-2 text-sm text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-3">
            <Info size={16} className="shrink-0 mt-0.5 text-[#94A3B8]" />
            <span>No hay causación pendiente por consolidar (las 4 cuentas de seguridad social están en cero para este periodo).</span>
          </div>
        ) : (
          <>
            {/* Desglose */}
            <div className="border-t border-[#F1F5F9] pt-3">
              <p className="text-xs font-medium text-[#64748B] mb-2">Pendiente por consolidar (saldo de las 4 cuentas)</p>
              <div className="space-y-1">
                {resumen.lineas.map(l => (
                  <div key={l.cuenta + l.tercero} className="flex items-center justify-between text-sm">
                    <span className="text-[#475569]">{l.cuentaNombre} · <span className="text-[#0F172A]">{l.tercero}</span></span>
                    <span className="tabular-nums text-[#0F172A]">{formatCOP(l.monto)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold pt-1.5 mt-1 border-t border-[#E2E8F0]">
                  <span>Total causado</span>
                  <span className="tabular-nums">{formatCOP(resumen.causado)}</span>
                </div>
              </div>
            </div>

            {/* Monto real opcional + preview del ajuste */}
            <div className="border-t border-[#F1F5F9] pt-3 space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#475569]">Monto real de la planilla PILA <span className="text-[#94A3B8]">(opcional)</span></span>
                <input type="number" min="0" step="any" inputMode="decimal" placeholder="al causado"
                  className="w-40 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-right tabular-nums text-[#0F172A]"
                  value={montoReal} onChange={e => setMontoReal(e.target.value)} />
              </label>
              {real !== null && ajuste !== 0 && (
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <span>Ajuste al peso (52959515)</span>
                  <span className="tabular-nums">{formatCOP(ajuste)} {ajuste > 0 ? '(débito)' : '(crédito)'}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm bg-[#F8FAFC] border border-[#F1F5F9] rounded-lg px-3 py-2">
                <span className="text-[#475569]">Se acredita <strong className="text-[#0F172A]">23709510 · Aportes en Línea</strong></span>
                <span className="tabular-nums font-semibold text-[#0F172A]">{formatCOP(crValor)}</span>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end pt-1 border-t border-[#F1F5F9]">
          <button onClick={consolidar} disabled={!puede || posting}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {posting ? 'Consolidando…' : 'Consolidar seguridad social'}
          </button>
        </div>
      </div>
    </div>
  )
}
