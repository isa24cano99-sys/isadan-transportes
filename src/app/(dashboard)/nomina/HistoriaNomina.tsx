'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import type { HistoriaNomina as Historia, EventoNomina, EventoTipo, MesNomina } from './historia'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

const TIPO: Record<EventoTipo, { label: string; cls: string }> = {
  NOMINA:          { label: 'Nómina causada',          cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  PAGO_NETO:       { label: 'Neto pagado',             cls: 'bg-green-50 text-green-800 border-green-200' },
  SS_CONSOLIDADA:  { label: 'Seguridad social causada', cls: 'bg-purple-50 text-purple-800 border-purple-200' },
  PAGO_PILA:       { label: 'PILA pagada',             cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  PAGO_PRESTACION: { label: 'Prestaciones pagadas',    cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  REVERSION:       { label: 'Reversión',               cls: 'bg-red-50 text-red-800 border-red-200' },
}

const money = (v: number) => (Math.abs(v) < 0.5 ? '—' : formatCOP(v))

function Evento({ e }: { e: EventoNomina }) {
  const [abierto, setAbierto] = useState(false)
  const t = TIPO[e.tipo]
  return (
    <li className="border border-[#E2E8F0] rounded-lg">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F8FAFC] rounded-lg"
        aria-expanded={abierto}
      >
        {abierto ? <ChevronDown size={14} className="shrink-0 text-[#64748B]" /> : <ChevronRight size={14} className="shrink-0 text-[#64748B]" />}
        <span className="text-xs text-[#64748B] tabular-nums w-20 shrink-0">{e.fecha}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${t.cls}`}>{t.label}</span>
        <span className="text-sm text-[#0F172A] truncate flex-1 min-w-0">{e.tercero || e.descripcion}</span>
        <span className="font-mono text-xs text-[#64748B] shrink-0">{e.comprobante}</span>
        <span className="text-sm font-semibold tabular-nums text-[#0F172A] shrink-0 w-28 text-right">{money(e.monto)}</span>
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-[#64748B]">
            {e.detalle}{e.soporte ? <> · Soporte: <span className="text-[#0F172A]">{e.soporte}</span></> : null}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="py-1.5 pr-3 font-semibold">Cuenta</th>
                  <th className="py-1.5 pr-3 font-semibold">Tercero</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Débito</th>
                  <th className="py-1.5 font-semibold text-right">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {e.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-[#F1F5F9]">
                    <td className="py-1.5 pr-3 text-[#0F172A]"><span className="font-mono">{l.cuenta}</span> {l.nombre}</td>
                    <td className="py-1.5 pr-3 text-[#64748B]">{l.tercero || '—'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#0F172A]">{money(l.debito)}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#0F172A]">{money(l.credito)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  )
}

function Mes({ m, inicial }: { m: MesNomina; inicial: boolean }) {
  const [abierto, setAbierto] = useState(inicial)
  const cifras: { label: string; value: number }[] = [
    { label: 'Causado', value: m.causado },
    { label: 'Neto causado', value: m.netoCausado },
    { label: 'Neto pagado', value: m.netoPagado },
    { label: 'SS causada', value: m.ssConsolidada },
    { label: 'PILA pagada', value: m.pilaPagada },
  ]
  if (m.prestacionesPagadas > 0) cifras.push({ label: 'Prestaciones pagadas', value: m.prestacionesPagadas })

  return (
    <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[#F8FAFC]"
        aria-expanded={abierto}
      >
        <div className="flex items-center gap-2">
          {abierto ? <ChevronDown size={16} className="text-[#64748B]" /> : <ChevronRight size={16} className="text-[#64748B]" />}
          <h2 className="text-base font-semibold text-[#0F172A]">{nombreMes(m.mes)}</h2>
          <span className="text-xs text-[#64748B]">{m.eventos.length} movimiento{m.eventos.length !== 1 ? 's' : ''}</span>
        </div>
        {m.sinCausar.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <AlertTriangle size={12} /> Falta nómina de {m.sinCausar.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {cifras.map(c => (
              <div key={c.label} className="bg-[#F8FAFC] rounded-lg px-3 py-2">
                <p className="text-xs text-[#64748B]">{c.label}</p>
                <p className="text-sm font-semibold tabular-nums text-[#0F172A]">{money(c.value)}</p>
              </div>
            ))}
          </div>

          {m.sinCausar.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sin nómina causada este mes: <span className="font-semibold">{m.sinCausar.join(', ')}</span>.
              Se causa en la pestaña «Causar nómina».
            </p>
          )}

          {m.eventos.length === 0 ? (
            <p className="text-sm text-[#64748B] bg-[#F8FAFC] rounded-lg p-4">Sin movimientos de nómina en este mes.</p>
          ) : (
            <ul className="space-y-1.5">
              {m.eventos.map(e => <Evento key={e.id} e={e} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default function HistoriaNomina({ historia }: { historia: Historia }) {
  const totalProv = historia.provisiones.reduce((s, p) => s + p.saldo, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B]">Neto por pagar a conductores</p>
          <p className={`text-lg font-bold tabular-nums ${historia.netoPendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatCOP(historia.netoPendiente)}</p>
          <p className="text-xs text-[#64748B] mt-0.5">Saldo de 250505 (si es negativo, se pagó de más)</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B]">PILA por pagar</p>
          <p className={`text-lg font-bold tabular-nums ${historia.pilaPendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatCOP(historia.pilaPendiente)}</p>
          <p className="text-xs text-[#64748B] mt-0.5">Saldo de 23709510 con Aportes en Línea</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B]">Prestaciones provisionadas</p>
          <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatCOP(totalProv)}</p>
          <p className="text-xs text-[#64748B] mt-0.5">
            {historia.provisiones.map(p => `${p.nombre.split(' ')[0]} ${formatCOP(p.saldo)}`).join(' · ')}
          </p>
        </div>
      </div>

      <p className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 leading-relaxed">
        Cada mes muestra lo que pasó con la nómina: cuándo se causó, cuánto se pagó y a quién, la seguridad social y
        el asiento de cada movimiento. Pulsa un movimiento para ver las cuentas del asiento. Todo sale del libro.
      </p>

      {historia.meses.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6 text-center">Aún no hay movimientos de nómina contabilizados.</p>
      ) : (
        historia.meses.map((m, i) => <Mes key={m.mes} m={m} inicial={i < 2} />)
      )}
    </div>
  )
}
