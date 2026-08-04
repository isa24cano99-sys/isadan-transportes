'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { postearNominaAction, type NominaResultado } from './actions'

type Conductor = { terceroId: string; nombre: string }
type Fondo = { id: string; nombre: string; esDefault: boolean }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CAMPOS: { key: string; label: string }[] = [
  { key: 'sueldo',        label: 'Sueldo' },
  { key: 'auxilio',       label: 'Auxilio de transporte' },
  { key: 'cesantias',     label: 'Cesantías' },
  { key: 'intereses',     label: 'Intereses cesantías' },
  { key: 'prima',         label: 'Prima' },
  { key: 'vacaciones',    label: 'Vacaciones' },
  { key: 'aporteEps',     label: 'Aporte EPS' },
  { key: 'aporteArl',     label: 'Aporte ARL' },
  { key: 'aportePension', label: 'Aporte pensión' },
  { key: 'aporteCaja',    label: 'Aporte caja' },
]

export default function NominaClient({ conductores, fondos }: { conductores: Conductor[]; fondos: Fondo[] }) {
  const router = useRouter()
  const now = new Date()
  const [terceroId, setTerceroId] = useState(conductores[0]?.terceroId ?? '')
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(7) // julio por defecto (primer mes post-corte)
  const [fondoId, setFondoId] = useState(fondos.find(f => f.esDefault)?.id ?? fondos[0]?.id ?? '')
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<NominaResultado | null>(null)

  const setMonto = (k: string, v: string) => setMontos(p => ({ ...p, [k]: v }))
  const num = (k: string) => Number(montos[k]) || 0
  const total = CAMPOS.reduce((s, c) => s + num(c.key), 0)

  const submit = async () => {
    if (!terceroId || loading) return
    const cond = conductores.find(c => c.terceroId === terceroId)
    setLoading(true); setResultado(null)
    const res = await postearNominaAction({
      conductorTerceroId: terceroId,
      driverName: cond?.nombre ?? '',
      year, month, fondoTerceroId: fondoId,
      sueldo: num('sueldo'), auxilio: num('auxilio'), cesantias: num('cesantias'),
      intereses: num('intereses'), prima: num('prima'), vacaciones: num('vacaciones'),
      aporteEps: num('aporteEps'), aporteArl: num('aporteArl'),
      aportePension: num('aportePension'), aporteCaja: num('aporteCaja'),
    })
    setResultado(res)
    setLoading(false)
    if (res.ok) { setMontos({}); router.refresh() }
  }

  const selCls = 'border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white'
  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-right tabular-nums text-[#0F172A]'

  return (
    <div className="space-y-4">
      {resultado && (
        <div className={`text-sm rounded-xl border p-4 ${resultado.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
          {resultado.ok ? '✓ ' : '✗ '}{resultado.mensaje}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        {/* Encabezado: conductor + mes + fondo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#64748B]">Conductor</span>
            <select className={selCls} value={terceroId} onChange={e => setTerceroId(e.target.value)}>
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
            <label className="flex flex-col gap-1 w-28">
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
        </div>

        {/* 10 montos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#F1F5F9]">
          {CAMPOS.map(c => (
            <label key={c.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-[#475569]">{c.label}</span>
              <input
                type="number" min="0" step="any" inputMode="decimal"
                className={inputCls} placeholder="0"
                value={montos[c.key] ?? ''} onChange={e => setMonto(c.key, e.target.value)}
                style={{ maxWidth: '10rem' }}
              />
            </label>
          ))}
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
