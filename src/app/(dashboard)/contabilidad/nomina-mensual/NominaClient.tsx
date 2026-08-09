'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearNominaAction, type NominaResultado } from './actions'

type Conductor = { terceroId: string; nombre: string; salario: number; auxilio: number }
type Fondo = { id: string; nombre: string; esDefault: boolean }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Factores legales LITERALES verificados contra abril/mayo/junio (Daniel y Jhon Jairo), sin
// diferencia de pesos. NO usar 1/12 ni 1/24 — la fracción exacta no reproduce los comprobantes.
const F_CESANTIAS  = 0.0833   // (sueldo+auxilio) × 8.33%
const F_PRIMA      = 0.0833   // (sueldo+auxilio) × 8.33%
const F_VACACIONES = 0.0417   // sueldo × 4.17%
const F_INTERESES  = 0.12     // cesantías × 12%
const F_ARL        = 0.0435   // sueldo × 4.35%
const F_CAJA       = 0.04     // sueldo × 4%

// 6 conceptos derivados de sueldo+auxilio (los que la función recibe como parámetros)
function derivar(sueldo: number, auxilio: number) {
  const base = sueldo + auxilio
  const cesantias = Math.round(base * F_CESANTIAS)
  return {
    cesantias,
    intereses:  Math.round(cesantias * F_INTERESES),
    prima:      Math.round(base * F_PRIMA),
    vacaciones: Math.round(sueldo * F_VACACIONES),
    aporteArl:  Math.round(sueldo * F_ARL),
    aporteCaja: Math.round(sueldo * F_CAJA),
  }
}

type DerivKey = 'cesantias' | 'intereses' | 'prima' | 'vacaciones' | 'aporteArl' | 'aporteCaja'
const DERIV_LABELS: { key: DerivKey; label: string; formula: string }[] = [
  { key: 'cesantias',  label: 'Cesantías',          formula: '(sueldo+aux) × 8.33%' },
  { key: 'intereses',  label: 'Intereses cesantías', formula: 'cesantías × 12%' },
  { key: 'prima',      label: 'Prima',               formula: '(sueldo+aux) × 8.33%' },
  { key: 'vacaciones', label: 'Vacaciones',          formula: 'sueldo × 4.17%' },
  { key: 'aporteArl',  label: 'Aporte ARL',          formula: 'sueldo × 4.35%' },
  { key: 'aporteCaja', label: 'Aporte caja',         formula: 'sueldo × 4%' },
]

export default function NominaClient({ conductores, fondos }: { conductores: Conductor[]; fondos: Fondo[] }) {
  const router = useRouter()
  const [terceroId, setTerceroId] = useState(conductores[0]?.terceroId ?? '')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(7) // julio por defecto (primer mes post-corte)
  const [dias, setDias] = useState(30)  // días trabajados (30 = mes completo)
  const [fondoId, setFondoId] = useState(fondos.find(f => f.esDefault)?.id ?? fondos[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<NominaResultado | null>(null)

  // Base editable (sueldo/auxilio). Si el usuario los toca, se respeta su valor; al cambiar
  // conductor o días vuelven a pre-llenarse prorrateados. undefined = usar el prorrateo automático.
  const [sueldoManual,  setSueldoManual]  = useState<string | undefined>(undefined)
  const [auxilioManual, setAuxilioManual] = useState<string | undefined>(undefined)
  // Ajuste manual de los 6 derivados
  const [manual, setManual] = useState(false)
  const [derivManual, setDerivManual] = useState<Record<DerivKey, string>>({} as Record<DerivKey, string>)

  const cond = useMemo(() => conductores.find(c => c.terceroId === terceroId), [conductores, terceroId])

  // Prorrateo por días: sueldo y auxilio del conductor × días/30 (ambos prorratean por ley).
  const factorDias = Math.min(Math.max(dias, 0), 31) / 30
  const sueldoAuto  = Math.round((cond?.salario ?? 0) * factorDias)
  const auxilioAuto = Math.round((cond?.auxilio ?? 0) * factorDias)
  const sueldo  = sueldoManual  !== undefined ? (Number(sueldoManual)  || 0) : sueldoAuto
  const auxilio = auxilioManual !== undefined ? (Number(auxilioManual) || 0) : auxilioAuto

  const derivAuto = useMemo(() => derivar(sueldo, auxilio), [sueldo, auxilio])
  const derivVal = (k: DerivKey) => (manual ? (Number(derivManual[k]) || 0) : derivAuto[k])

  // Derivados del IBC (sueldo) — reglas fijas de la función (solo lectura): EPS/pensión + neto
  const epsEmpleado     = Math.round(sueldo * 0.04)
  const pensionEmpleado = Math.round(sueldo * 0.04)
  const pensionPatronal = Math.round(sueldo * 0.12)
  const neto            = sueldo + auxilio - epsEmpleado - pensionEmpleado

  // Total devengado + aportes patronales (incluye pensión patronal derivada; EPS patronal = 0)
  const total = sueldo + auxilio
    + DERIV_LABELS.reduce((s, d) => s + derivVal(d.key), 0)
    + pensionPatronal

  const onConductor = (id: string) => { setTerceroId(id); setSueldoManual(undefined); setAuxilioManual(undefined); setManual(false) }
  const onDias = (v: number) => { setDias(v); setSueldoManual(undefined); setAuxilioManual(undefined) } // re-prorratea

  const toggleManual = () => {
    if (!manual) setDerivManual(Object.fromEntries(DERIV_LABELS.map(d => [d.key, String(derivAuto[d.key])])) as Record<DerivKey, string>)
    setManual(m => !m)
  }

  const submit = async () => {
    if (!terceroId || loading || total <= 0) return
    setLoading(true); setResultado(null)
    const res = await postearNominaAction({
      conductorTerceroId: terceroId,
      driverName: cond?.nombre ?? '',
      year, month, fondoTerceroId: fondoId,
      sueldo, auxilio,
      cesantias: derivVal('cesantias'), intereses: derivVal('intereses'),
      prima: derivVal('prima'), vacaciones: derivVal('vacaciones'),
      aporteArl: derivVal('aporteArl'), aporteCaja: derivVal('aporteCaja'),
    })
    setResultado(res)
    setLoading(false)
    if (res.ok) { setSueldoManual(undefined); setAuxilioManual(undefined); setManual(false); router.refresh() }
  }

  const selCls = 'border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white'
  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-right tabular-nums text-[#0F172A]'
  const roCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-right tabular-nums bg-[#F1F5F9] text-[#64748B]'

  return (
    <div className="space-y-4">
      {resultado && (
        <div className={`text-sm rounded-xl border p-4 ${resultado.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {resultado.ok ? '✓ ' : '✗ '}{resultado.mensaje}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        {/* Encabezado: conductor + mes + fondo + días */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748B]">Conductor</span>
            <select className={selCls} value={terceroId} onChange={e => onConductor(e.target.value)}>
              {conductores.map(c => <option key={c.terceroId} value={c.terceroId}>{c.nombre}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-[#64748B]">Mes</span>
              <select className={selCls} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 w-24">
              <span className="text-xs font-medium text-[#64748B]">Año</span>
              <select className={selCls} value={year} onChange={e => setYear(Number(e.target.value))}>
                {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748B]">Fondo de pensión</span>
            <select className={selCls} value={fondoId} onChange={e => setFondoId(e.target.value)}>
              {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}{f.esDefault ? ' (sugerido)' : ''}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748B]">Días trabajados</span>
            <input type="number" min="0" max="31" className={selCls + ' text-right tabular-nums'}
              value={dias} onChange={e => onDias(Number(e.target.value))} />
            {dias !== 30 && <span className="text-[11px] text-amber-600">Mes parcial: sueldo y auxilio prorrateados ×{dias}/30</span>}
          </label>
        </div>

        {/* Base editable: sueldo + auxilio (pre-llenados desde Conductores, prorrateados) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#F1F5F9]">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#475569]">Sueldo (IBC)</span>
            <input type="number" min="0" step="any" inputMode="decimal" className={inputCls} style={{ maxWidth: '10rem' }}
              value={sueldoManual ?? String(sueldoAuto)} onChange={e => setSueldoManual(e.target.value)} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#475569]">Auxilio de transporte</span>
            <input type="number" min="0" step="any" inputMode="decimal" className={inputCls} style={{ maxWidth: '10rem' }}
              value={auxilioManual ?? String(auxilioAuto)} onChange={e => setAuxilioManual(e.target.value)} />
          </label>
        </div>

        {/* 6 derivados calculados (solo lectura por defecto; toggle para ajustar) */}
        <div className="pt-2 border-t border-[#F1F5F9]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B]">Calculado (fórmulas legales verificadas)</span>
            <button type="button" onClick={toggleManual}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                manual ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-[#2563EB] border-[#E2E8F0] hover:bg-[#F8FAFC]'}`}>
              {manual ? '↩ Volver al cálculo' : '✎ Ajustar manualmente'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DERIV_LABELS.map(d => (
              <label key={d.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#475569]">{d.label}
                  <span className="block text-[10px] text-[#94A3B8] leading-none">{d.formula}</span>
                </span>
                <input type="number" min="0" step="any" inputMode="decimal"
                  className={manual ? inputCls : roCls} style={{ maxWidth: '10rem' }} readOnly={!manual}
                  value={manual ? (derivManual[d.key] ?? '') : String(derivAuto[d.key])}
                  onChange={e => setDerivManual(p => ({ ...p, [d.key]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        {/* Derivado del IBC (siempre solo lectura): EPS/pensión + neto */}
        <div className="rounded-lg bg-[#F8FAFC] border border-[#F1F5F9] px-3 py-2.5 space-y-1">
          <p className="text-[11px] font-medium text-[#64748B]">Derivado del Sueldo (retenciones — no se digita)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[#475569] tabular-nums">
            <span>EPS empleado (4%)</span><span className="text-right">{formatCOP(epsEmpleado)}</span>
            <span>Pensión empleado (4%)</span><span className="text-right">{formatCOP(pensionEmpleado)}</span>
            <span>Pensión patronal (12%)</span><span className="text-right">{formatCOP(pensionPatronal)}</span>
            <span className="text-[#94A3B8]">EPS patronal (exonerado)</span><span className="text-right text-[#94A3B8]">{formatCOP(0)}</span>
            <span className="font-medium text-[#0F172A] pt-0.5 border-t border-[#E2E8F0] mt-0.5">Neto a pagar (250505)</span>
            <span className="text-right font-medium text-[#0F172A] pt-0.5 border-t border-[#E2E8F0] mt-0.5">{formatCOP(neto)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#F1F5F9]">
          <span className="text-xs text-[#64748B]">Total devengado + aportes: <strong className="tabular-nums text-[#0F172A]">{formatCOP(total)}</strong></span>
          <button onClick={submit} disabled={loading || !terceroId || total <= 0}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {loading ? 'Contabilizando…' : 'Contabilizar nómina'}
          </button>
        </div>
      </div>
    </div>
  )
}
