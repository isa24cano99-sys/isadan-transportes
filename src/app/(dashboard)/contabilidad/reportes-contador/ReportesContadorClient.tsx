'use client'

import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import type { ReportesContador, SaldoPeriodo } from '@/lib/contabilidad-reportes'

// ── Construcción de las hojas (array-of-arrays; números crudos para que Excel sume) ──
type Row = (string | number)[]

// Identificación de la empresa para el encabezado formal de cada hoja.
const EMPRESA = { razon: 'ISADAN TRANSPORTES S.A.S.', nit: '902030120', dv: '6' }
// Versión del formato de reportes (semántica manual — subir al cambiar estructura/criterios).
const REPORTE_VERSION = 'v1.0'
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

// Redondeo a 2 decimales para quitar ruido de punto flotante (el formato #,##0 muestra sin decimales).
const N = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }

// Escribe una hoja con formato: encabezado, títulos de columna en negrilla+relleno, datos con
// formato numérico #,##0, panel inmovilizado bajo el encabezado y autofiltro. (ws = worksheet exceljs)
const FILL_SUBTOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
// Fila de cierre (TOTAL GENERAL): más marcada que un subtotal — relleno más oscuro + doble borde.
const FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CBD1' } }
function estilarHoja(ws: any, titulo: string, aoa: Row[], cols: number[], d: ReportesContador, esSubtotal?: (r: Row) => boolean, esTotalGeneral?: (r: Row) => boolean) {
  for (const r of encabezado(titulo, d)) ws.addRow(r)
  ws.getRow(1).font = { bold: true, size: 13 }
  ws.getRow(3).font = { bold: true, size: 12 }
  const headerIdx = 7 // el encabezado ocupa 6 filas
  const header = aoa[0] as (string | number)[]
  const hr = ws.addRow(header)
  hr.eachCell((c: any) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = FILL_HEADER
    c.alignment = { vertical: 'middle' }
  })
  for (let i = 1; i < aoa.length; i++) {
    const sub = esSubtotal?.(aoa[i])
    const tot = esTotalGeneral?.(aoa[i])
    const row = ws.addRow((aoa[i] as any[]).map(N))
    row.eachCell((c: any) => {
      if (typeof c.value === 'number') { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right' } }
      // Filas de subtotal: negrilla + relleno gris + borde superior, para que NO se sumen a mano.
      if (sub) { c.font = { bold: true, italic: true }; c.fill = FILL_SUBTOTAL; c.border = { top: { style: 'thin', color: { argb: 'FF9CA3AF' } } } }
      // Fila de cierre TOTAL GENERAL: negrilla + relleno más oscuro + DOBLE borde superior e inferior.
      if (tot) {
        c.font = { bold: true, size: 12 }
        c.fill = FILL_TOTAL
        c.border = { top: { style: 'double', color: { argb: 'FF374151' } }, bottom: { style: 'double', color: { argb: 'FF374151' } } }
      }
    })
  }
  cols.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  // Panel inmovilizado bajo la fila de encabezado. topLeftCell EXPLÍCITO (A8) — no dejar que
  // exceljs lo derive (en algún entorno lo calculó mal, p.ej. A67 en Balance).
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerIdx, topLeftCell: `A${headerIdx + 1}`, activeCell: `A${headerIdx + 1}` }]
  ws.autoFilter = { from: { row: headerIdx, column: 1 }, to: { row: headerIdx, column: header.length } }
}

// Hoja de portada: identificación, índice de hojas y los 4 cruces de consistencia.
function portada(ws: any, d: ReportesContador, chk: { balance: boolean; mayor: boolean; esf: boolean; eri: boolean; totD: number; activo: number; utilidad: number }, generado: string) {
  ws.getColumn(1).width = 2; ws.getColumn(2).width = 48; ws.getColumn(3).width = 28
  const add = (b?: string, c?: string | number) => ws.addRow(['', b ?? '', c ?? ''])
  add(EMPRESA.razon).getCell(2).font = { bold: true, size: 15 }
  add(`NIT ${EMPRESA.nit}-${EMPRESA.dv}`)
  add()
  add('REPORTES CONTABLES').getCell(2).font = { bold: true, size: 13 }
  add(`Periodo: ${mesLabel(d.periodo)}  ·  corte al ${d.corte}`)
  // Versión + fecha de generación visibles: identifican sin ambigüedad de qué archivo se trata.
  add('Versión del formato', REPORTE_VERSION).getCell(2).font = { bold: true }
  add('Generado', generado).getCell(2).font = { bold: true }
  add('Cifras en pesos colombianos (COP)')
  add()
  add('ÍNDICE').getCell(2).font = { bold: true }
  add('1 · Libro Diario'); add('2 · Libro Mayor (auxiliar por cuenta y tercero)')
  add('3 · Balance de Comprobación'); add('4 · Estado de Situación Financiera (ESF)')
  add('5 · Estado de Resultados Integral (ERI)')
  add()
  add('VERIFICACIÓN DE CONSISTENCIA').getCell(2).font = { bold: true }
  const linea = (ok: boolean, label: string, val?: number) => {
    const r = add((ok ? '✓ ' : '✗ ') + label, val != null ? Math.round(val) : '')
    r.getCell(2).font = { color: { argb: ok ? 'FF047857' : 'FFB91C1C' } }
    if (val != null) r.getCell(3).numFmt = '#,##0'
  }
  linea(chk.balance, 'Balance cuadra (Σ débito = Σ crédito)', chk.totD)
  linea(chk.mayor, 'Libro Mayor = Balance por cuenta')
  linea(chk.esf, 'ESF: Activo = Pasivo + Patrimonio', chk.activo)
  linea(chk.eri, 'ERI ↔ ESF (Utilidad del ejercicio)', chk.utilidad)
}

// Etiqueta exacta de la fila de cierre — se usa también como predicado de estilo.
const TOTAL_GENERAL_DIARIO = 'TOTAL GENERAL DEL PERIODO (sin apertura)'
function aoaDiario(d: ReportesContador): Row[] {
  const rows: Row[] = [['Fecha', 'Comprobante', 'Cuenta', 'Nombre cuenta', 'Tercero', 'NIT', 'Centro costo', 'Doc. soporte', 'Descripción', 'Débito', 'Crédito']]
  let totalD = 0, totalC = 0
  for (const a of d.diario) {
    // El asiento de apertura CA se marca explícito: es el saldo inicial, no un movimiento del mes.
    if (a.tipo === 'CA') rows.push(['', a.comprobante, '', '', '', '', '', '', 'APERTURA — saldo inicial (no es movimiento del periodo)', '', ''])
    for (const l of a.lineas) {
      rows.push([a.fecha, a.comprobante, l.cuenta, l.nombre, l.tercero ?? '', l.terceroNit ?? '', l.centroCosto ?? '', l.docSoporte ?? '', a.descripcion, l.debito || '', l.credito || ''])
    }
    rows.push(['', a.comprobante + (a.tipo === 'CA' ? ' · total apertura' : ' · total'), '', '', '', '', '', '', '', a.totalDebito, a.totalCredito])
    // El total general suma SOLO el movimiento del periodo (la apertura es saldo inicial, no
    // movimiento) — así coincide exacto con "Balance cuadra" de la Portada.
    if (a.tipo !== 'CA') { totalD += a.totalDebito; totalC += a.totalCredito }
  }
  rows.push(['', TOTAL_GENERAL_DIARIO, '', '', '', '', '', '', '', totalD, totalC])
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
  // Nota al pie: desagregación del anticipo a trabajadores (13301510) en el ESF vs. su saldo
  // neto en el Balance de Comprobación. Cifras dinámicas tomadas del propio split.
  const deu = d.esf.activo.find(b => b.cuenta === '13301510')?.saldoFinal
  const acr = d.esf.pasivo.find(b => b.cuenta === '13301510')?.saldoFinal
  if (deu != null && acr != null) {
    rows.push([])
    rows.push(['Nota', '', `El saldo neto de la cuenta 13301510 (${formatCOP(acr - deu)}, crédito) se presenta desagregado en el ESF: ` +
      `${formatCOP(deu)} como saldo deudor (Activo) y ${formatCOP(acr)} como saldo acreedor (Pasivo), para no compensar ` +
      `partidas de distinta naturaleza. En el Balance de Comprobación esta cuenta aparece consolidada en su saldo neto.`])
  }
  return rows
}

const montoERI = (b: SaldoPeriodo) => {
  const c = b.cuenta.charAt(0)
  return (c === '5' || c === '6' || c === '7') ? b.debitoPeriodo - b.creditoPeriodo : b.creditoPeriodo - b.debitoPeriodo
}
function aoaERI(d: ReportesContador): Row[] {
  const rows: Row[] = [['Grupo', 'Cuenta', 'Nombre', 'Valor del periodo']]
  const seccion = (titulo: string, arr: SaldoPeriodo[], total: number) => {
    rows.push([titulo, '', '', ''])
    for (const b of arr) rows.push(['', b.cuenta, b.nombre, montoERI(b)])
    rows.push(['', '', `TOTAL ${titulo}`, total])
  }
  const e = d.eri
  seccion('INGRESOS OPERACIONALES', e.ingresosOper, e.totalIngresosOper)
  seccion('COSTOS', e.costos, e.totalCostos)
  rows.push(['', '', '= UTILIDAD BRUTA', e.utilidadBruta])
  seccion('GASTOS OPERACIONALES (admin. y personal)', e.gastosOper, e.totalGastosOper)
  rows.push(['', '', '= UTILIDAD OPERACIONAL', e.utilidadOperacional])
  seccion('EROGACIONES A FAVOR DE LOS SOCIOS', e.erogSocios, e.totalErogSocios)
  seccion('INGRESOS FINANCIEROS / NO OPERACIONALES', e.ingresosFin, e.totalIngresosFin)
  seccion('GASTOS FINANCIEROS / NO OPERACIONALES', e.gastosFin, e.totalGastosFin)
  rows.push(['', '', '= UTILIDAD (PÉRDIDA) DEL EJERCICIO', e.utilidad])
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
      const ExcelJS: any = await import('exceljs')
      const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook
      const wb = new Workbook()
      wb.creator = 'Sistema contable ISADAN'

      // Fecha/hora de generación (navegador). Identifica la copia impresa/enviada.
      const generado = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
      portada(wb.addWorksheet('Portada'), data, {
        balance: balanceCuadra, mayor: mayorCuadra, esf: esfCuadra, eri: eriEsfConecta,
        totD, activo, utilidad: data.eri.utilidad,
      }, generado)

      const hojas: [string, string, Row[], number[]][] = [
        ['Libro Diario', 'LIBRO DIARIO', aoaDiario(data), [12, 12, 12, 30, 30, 14, 12, 20, 30, 15, 15]],
        ['Libro Mayor', 'LIBRO MAYOR (auxiliar por cuenta y tercero)', aoaMayor(data), [12, 28, 30, 14, 12, 12, 18, 26, 15, 15, 16]],
        ['Balance de Comprobación', 'BALANCE DE COMPROBACIÓN', aoaBalance(data), [12, 34, 10, 16, 16, 16, 16]],
        ['ESF', 'ESTADO DE SITUACIÓN FINANCIERA', aoaESF(data), [14, 12, 40, 16, 16, 16]],
        ['ERI', 'ESTADO DE RESULTADOS INTEGRAL', aoaERI(data), [14, 12, 40, 18]],
      ]
      // En el Libro Diario, las filas "· total" de cada asiento son subtotales — se marcan
      // (negrilla+gris) para que no se sumen por error si alguien totaliza la columna a mano.
      const esSubtotalDiario = (r: Row) => typeof r[1] === 'string' && (r[1] as string).includes('· total')
      const esTotalGeneralDiario = (r: Row) => r[1] === TOTAL_GENERAL_DIARIO
      for (const [nombre, titulo, aoa, cols] of hojas) {
        const esDiario = nombre === 'Libro Diario'
        estilarHoja(wb.addWorksheet(nombre), titulo, aoa, cols, data,
          esDiario ? esSubtotalDiario : undefined, esDiario ? esTotalGeneralDiario : undefined)
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `reportes-contador-${data.periodo}.xlsx`; a.click()
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
        {loading ? 'Generando…' : `Descargar Excel (5 hojas) · ${data.periodo}`}
      </button>
      <p className="text-xs text-[#94A3B8]">Un solo archivo <code>reportes-contador-{data.periodo}.xlsx</code> con pestañas: Libro Diario · Libro Mayor · Balance de Comprobación · ESF · ERI.</p>
    </div>
  )
}
