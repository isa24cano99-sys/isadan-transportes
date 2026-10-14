'use client'

import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import type { ReportesContador } from '@/lib/contabilidad-reportes'
import { construirWorkbookContador, MESES } from '@/lib/contabilidad-reportes-excel'

// El armado del Excel (portada + 6 hojas) vive en @/lib/contabilidad-reportes-excel
// (fuente única: la misma función la usa un script de verificación por node).

export default function ReportesContadorClient({ data }: { data: ReportesContador }) {
  const [loading, setLoading] = useState(false)

  // ── Cruces de consistencia (se muestran en pantalla y garantizan las hojas) ──
  const totD = data.balance.reduce((s, b) => s + b.debitoPeriodo, 0)
  const totC = data.balance.reduce((s, b) => s + b.creditoPeriodo, 0)
  const balanceCuadra = Math.abs(totD - totC) < 0.01
  const activo = data.esf.totalActivo
  const pasivoMasPat = data.esf.totalPasivo + data.esf.totalPatrimonio + data.esf.utilidad
  const esfCuadra = Math.abs(activo - pasivoMasPat) < 0.01
  // El ESF usa el resultado ACUMULADO; se compara contra el acumulado del ERI, no el del mes
  // (si no, agosto saldría en rojo aunque cuadre).
  const eriEsfConecta = Math.abs(data.eri.utilidadAcumulada - data.esf.utilidad) < 0.01
  // Balance saldo final por cuenta == Libro Mayor saldo final por cuenta
  const mayorByCuenta = new Map(data.mayor.map(c => [c.cuenta, c.saldoFinal]))
  const mayorCuadra = data.balance.every(b => Math.abs((mayorByCuenta.get(b.cuenta) ?? 0) - b.saldoFinal) < 0.01)

  const descargar = async () => {
    setLoading(true)
    try {
      // Fecha/hora de generación (navegador). Identifica la copia impresa/enviada.
      const generado = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
      const wb = await construirWorkbookContador(data, generado, {
        balance: balanceCuadra, mayor: mayorCuadra, esf: esfCuadra, eri: eriEsfConecta,
        totD, activo, utilidad: data.esf.utilidad,
      })
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const [aY, aM] = data.periodo.split('-')
      a.href = url; a.download = `Reporte ${MESES[Number(aM)]}-${aY}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  const Chip = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {ok ? '✓' : '⚠'} {label}
    </span>
  )

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <p className="text-sm font-semibold text-[#0F172A] mb-2">Vista previa · corte al {data.corte}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <div><p className="text-[11px] text-[#94A3B8] uppercase">Diario</p><p className="font-medium tabular-nums">{data.diario.length} asientos</p></div>
          <div><p className="text-[11px] text-[#94A3B8] uppercase">Mayor</p><p className="font-medium tabular-nums">{data.mayor.length} cuentas</p></div>
          <div><p className="text-[11px] text-[#94A3B8] uppercase">Balance</p><p className="font-medium tabular-nums">{data.balance.length} cuentas</p></div>
          <div><p className="text-[11px] text-[#94A3B8] uppercase">Activo (ESF)</p><p className="font-medium tabular-nums">{formatCOP(activo)}</p></div>
          <div><p className="text-[11px] text-[#94A3B8] uppercase">Utilidad (ERI)</p><p className={`font-medium tabular-nums ${data.eri.utilidad < 0 ? 'text-red-600' : ''}`}>{formatCOP(data.eri.utilidad)}</p></div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip ok={balanceCuadra} label="Balance cuadra (Σdébito = Σcrédito)" />
          <Chip ok={mayorCuadra} label="Mayor = Balance por cuenta" />
          <Chip ok={esfCuadra} label="ESF: Activo = Pasivo + Patrimonio" />
          <Chip ok={eriEsfConecta} label="ERI ↔ ESF (utilidad)" />
        </div>
      </div>

      <button onClick={descargar} disabled={loading}
        className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
        {loading ? 'Generando…' : `Descargar Excel (6 hojas) · ${data.periodo}`}
      </button>
      <p className="text-xs text-[#94A3B8]">Un solo archivo <code>Reporte {MESES[Number(data.periodo.split('-')[1])]}-{data.periodo.split('-')[0]}.xlsx</code> con pestañas: Libro Diario · Libro Mayor · Balance de Comprobación · Balance por Tercero · ESF · ERI. <span className="font-semibold text-[#B45309]">Marcado PRELIMINAR (v2.0).</span></p>
    </div>
  )
}
