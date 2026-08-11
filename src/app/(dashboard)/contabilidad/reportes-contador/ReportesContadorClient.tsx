'use client'

import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import type { ReportesContador, SaldoPeriodo } from '@/lib/contabilidad-reportes'

// ── Construcción de las hojas (array-of-arrays; números crudos para que Excel sume) ──
type Row = (string | number)[]

// Identificación de la empresa para el encabezado formal de cada hoja.
const EMPRESA = { razon: 'ISADAN TRANSPORTES S.A.S.', nit: '902030120', dv: '6' }
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const mesLabel = (p: string) => { const [y, m] = p.split('-'); return `${MESES[Number(m)]} de ${y}` }

// Bloque de encabezado (razón social · NIT+DV · título · periodo/corte · marco), + fila en blanco.
function encabezado(titulo: string, d: ReportesContador): Row[] {
  return [
    [EMPRESA.razon],
    [`NIT ${EMPRESA.nit}-${EMPRESA.dv}`],
    [titulo],
    [`Periodo: ${mesLabel(d.periodo)}  ·  corte al ${d.corte}`],
    ['Cifras en pesos colombianos (COP). Elaborado por el sistema contable ISADAN.'],
    [],
  ]
}

function aoaDiario(d: ReportesContador): Row[] {
  const rows: Row[] = [['Fecha', 'Comprobante', 'Cuenta', 'Nombre cuenta', 'Tercero', 'NIT', 'Centro costo', 'Doc. soporte', 'Descripción', 'Débito', 'Crédito']]
  for (const a of d.diario) {
    // El asiento de apertura CA se marca explícito: es el saldo inicial, no un movimiento del mes.
    if (a.tipo === 'CA') rows.push(['', a.comprobante, '', '', '', '', '', '', 'APERTURA — saldo inicial (no es movimiento del periodo)', '', ''])
    for (const l of a.lineas) {
      rows.push([a.fecha, a.comprobante, l.cuenta, l.nombre, l.tercero ?? '', l.terceroNit ?? '', l.centroCosto ?? '', l.docSoporte ?? '', a.descripcion, l.debito || '', l.credito || ''])
    }
    rows.push(['', a.comprobante + (a.tipo === 'CA' ? ' · total apertura' : ' · total'), '', '', '', '', '', '', '', a.totalDebito, a.totalCredito])
  }
  return rows
}

function aoaMayor(d: ReportesContador): Row[] {
  const rows: Row[] = [['Cuenta', 'Nombre', 'Tercero', 'NIT', 'Fecha', 'Comprobante', 'Doc. soporte', 'Descripción', 'Débito', 'Crédito', 'Saldo']]
  for (const c of d.mayor) {
    for (const g of c.grupos) {
      rows.push([c.cuenta, c.nombre, g.tercero, g.terceroNit ?? '', '', '', '', 'Saldo anterior', '', '', g.saldoAnterior])
      for (const m of g.movimientos) {
        rows.push([c.cuenta, c.nombre, g.tercero, g.terceroNit ?? '', m.fecha, m.comprobante, m.docSoporte ?? '', m.descripcion, m.debito || '', m.credito || '', m.saldoCorriente])
      }
      rows.push([c.cuenta, c.nombre, g.tercero, g.terceroNit ?? '', '', '', '', 'Saldo final', '', '', g.saldoFinal])
    }
    if (c.exigeTercero && c.grupos.length > 1) rows.push([c.cuenta, c.nombre + ' · TOTAL cuenta', '', '', '', '', '', '', '', '', c.saldoFinal])
  }
  return rows
}

function aoaBalance(d: ReportesContador): Row[] {
  const rows: Row[] = [['Cuenta', 'Nombre', 'Naturaleza', 'Saldo anterior', 'Débito periodo', 'Crédito periodo', 'Saldo final']]
  for (const b of d.balance) {
    rows.push([b.cuenta, b.nombre, b.naturaleza === 'DEBITO' ? 'DB' : 'CR', b.saldoAnterior, b.debitoPeriodo || '', b.creditoPeriodo || '', b.saldoFinal])
  }
  const totD = d.balance.reduce((s, b) => s + b.debitoPeriodo, 0)
  const totC = d.balance.reduce((s, b) => s + b.creditoPeriodo, 0)
  rows.push(['', 'TOTALES', '', '', totD, totC, ''])
  return rows
}

function aoaESF(d: ReportesContador): Row[] {
  const rows: Row[] = [['Grupo', 'Cuenta', 'Nombre', 'Saldo anterior', 'Movimiento', 'Saldo final']]
  const seccion = (titulo: string, arr: SaldoPeriodo[]) => {
    rows.push([titulo, '', '', '', '', ''])
    for (const b of arr) rows.push(['', b.cuenta, b.nombre, b.saldoAnterior, b.saldoFinal - b.saldoAnterior, b.saldoFinal])
  }
  seccion('ACTIVO', d.esf.activo)
  rows.push(['', '', 'TOTAL ACTIVO', '', '', d.esf.totalActivo])
  seccion('PASIVO', d.esf.pasivo)
  rows.push(['', '', 'TOTAL PASIVO', '', '', d.esf.totalPasivo])
  seccion('PATRIMONIO', d.esf.patrimonio)
  rows.push(['', '', 'Utilidad (pérdida) del ejercicio', '', '', d.esf.utilidad])
  rows.push(['', '', 'TOTAL PATRIMONIO', '', '', d.esf.totalPatrimonio + d.esf.utilidad])
  rows.push(['', '', 'PASIVO + PATRIMONIO', '', '', d.esf.totalPasivo + d.esf.totalPatrimonio + d.esf.utilidad])
  return rows
}

function aoaERI(d: ReportesContador): Row[] {
  const rows: Row[] = [['Grupo', 'Cuenta', 'Nombre', 'Valor del periodo']]
  const seccion = (titulo: string, arr: SaldoPeriodo[], total: number) => {
    rows.push([titulo, '', '', ''])
    for (const b of arr) {
      const clase = b.cuenta.charAt(0)
      const debitNat = clase === '5' || clase === '6' || clase === '7'
      const monto = debitNat ? b.debitoPeriodo - b.creditoPeriodo : b.creditoPeriodo - b.debitoPeriodo
      rows.push(['', b.cuenta, b.nombre, monto])
    }
    rows.push(['', '', `TOTAL ${titulo}`, total])
  }
  seccion('INGRESOS', d.eri.ingresos, d.eri.totalIngresos)
  seccion('COSTOS', d.eri.costos, d.eri.totalCostos)
  seccion('GASTOS', d.eri.gastos, d.eri.totalGastos)
  rows.push(['', '', 'UTILIDAD (PÉRDIDA) DEL EJERCICIO', d.eri.utilidad])
  return rows
}

export default function ReportesContadorClient({ data }: { data: ReportesContador }) {
  const [loading, setLoading] = useState(false)

  // ── Cruces de consistencia (se muestran en pantalla y garantizan las hojas) ──
  const totD = data.balance.reduce((s, b) => s + b.debitoPeriodo, 0)
  const totC = data.balance.reduce((s, b) => s + b.creditoPeriodo, 0)
  const balanceCuadra = Math.abs(totD - totC) < 0.01
  const activo = data.esf.totalActivo
  const pasivoMasPat = data.esf.totalPasivo + data.esf.totalPatrimonio + data.esf.utilidad
  const esfCuadra = Math.abs(activo - pasivoMasPat) < 0.01
  const eriEsfConecta = Math.abs(data.eri.utilidad - data.esf.utilidad) < 0.01
  // Balance saldo final por cuenta == Libro Mayor saldo final por cuenta
  const mayorByCuenta = new Map(data.mayor.map(c => [c.cuenta, c.saldoFinal]))
  const mayorCuadra = data.balance.every(b => Math.abs((mayorByCuenta.get(b.cuenta) ?? 0) - b.saldoFinal) < 0.01)

  const descargar = async () => {
    setLoading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const hojas: [string, string, Row[], number[]][] = [
        ['Libro Diario', 'LIBRO DIARIO', aoaDiario(data), [12, 12, 12, 30, 30, 14, 12, 20, 30, 15, 15]],
        ['Libro Mayor', 'LIBRO MAYOR (auxiliar por cuenta y tercero)', aoaMayor(data), [12, 28, 30, 14, 12, 12, 18, 26, 15, 15, 16]],
        ['Balance de Comprobación', 'BALANCE DE COMPROBACIÓN', aoaBalance(data), [12, 34, 10, 16, 16, 16, 16]],
        ['ESF', 'ESTADO DE SITUACIÓN FINANCIERA', aoaESF(data), [14, 12, 40, 16, 16, 16]],
        ['ERI', 'ESTADO DE RESULTADOS INTEGRAL', aoaERI(data), [14, 12, 40, 18]],
      ]
      for (const [nombre, titulo, aoa, cols] of hojas) {
        const ws = XLSX.utils.aoa_to_sheet([...encabezado(titulo, data), ...aoa])
        ws['!cols'] = cols.map(wch => ({ wch }))
        XLSX.utils.book_append_sheet(wb, ws, nombre)
      }
      XLSX.writeFile(wb, `reportes-contador-${data.periodo}.xlsx`)
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
        {loading ? 'Generando…' : `Descargar Excel (5 hojas) · ${data.periodo}`}
      </button>
      <p className="text-xs text-[#94A3B8]">Un solo archivo <code>reportes-contador-{data.periodo}.xlsx</code> con pestañas: Libro Diario · Libro Mayor · Balance de Comprobación · ESF · ERI.</p>
    </div>
  )
}
