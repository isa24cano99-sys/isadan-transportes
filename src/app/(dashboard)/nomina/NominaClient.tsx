'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import {
  Users, ChevronDown, ChevronUp, Loader2, CheckCircle2, X, FileDown, Pencil, Trash2,
} from 'lucide-react'
import { calcularNominaAction, guardarNominaAction, eliminarNominaAction, type NominaCalculo, type LegalizacionCalculo } from './actions'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type Payroll = {
  id: string
  year: number
  month: number
  period: string
  net_payment: number
  paid: boolean
  paid_date: string | null
  base_salary: number
  total_percentage: number
  total_favor_conductor: number
  total_favor_empresa: number
  prima: number
  other_additions: number
  other_deductions: number
  notes: string | null
}

type Driver = {
  id: string
  full_name: string
  document: string
  salary: number
  hire_date: string
  active: boolean
  payrollHistory: Payroll[]
}

const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-base md:text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1'

function LiqRow({ label, value, sign = '+', bold = false, color }: {
  label: string; value: number; sign?: '+' | '-'; bold?: boolean; color?: string
}) {
  if (value === 0) return null
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? 'border-t border-[#E2E8F0] pt-2 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-[#0F172A]' : 'text-[#64748B]'}`}>{label}</span>
      <span className={`text-sm font-semibold ${color ?? (bold ? 'text-[#0F172A]' : (sign === '-' ? 'text-red-500' : 'text-green-700'))}`}>
        {sign === '-' ? '−' : '+'}{formatCOP(value)}
      </span>
    </div>
  )
}

export default function NominaClient({ drivers }: { drivers: Driver[] }) {
  const now = new Date()
  const [payingDriver,      setPayingDriver]      = useState<Driver | null>(null)
  const [month,             setMonth]             = useState(now.getMonth() + 1)
  const [year,              setYear]              = useState(now.getFullYear())
  const [calculating,       setCalculating]       = useState(false)
  const [calculo,           setCalculo]           = useState<NominaCalculo | null>(null)
  const [totalFavorCond,    setTotalFavorCond]    = useState('0')
  const [totalFavorEmpresa, setTotalFavorEmpresa] = useState('0')
  const [prima,             setPrima]             = useState('0')
  const [primaSource,       setPrimaSource]       = useState<{ paidDate: string } | null>(null)
  const [otherAdditions,    setOtherAdditions]    = useState('0')
  const [otherDeductions,   setOtherDeductions]   = useState('0')
  const [notes,             setNotes]             = useState('')
  const [saving,              setSaving]              = useState(false)
  const [saveError,           setSaveError]           = useState('')
  const [expandedIds,         setExpandedIds]         = useState<Set<string>>(new Set())
  const [isEditMode,          setIsEditMode]          = useState(false)
  const [deletePayrollTarget, setDeletePayrollTarget] = useState<{ id: string; period: string; netPayment: number } | null>(null)
  const [deletingPayroll,     setDeletingPayroll]     = useState(false)
  const debRef         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipAutoFillRef = useRef(false)

  const num = (s: string) => parseFloat(s) || 0

  const netPayment =
    (payingDriver?.salary ?? 0)
    + num(totalFavorCond)
    - num(totalFavorEmpresa)
    + num(prima)
    + num(otherAdditions)
    - num(otherDeductions)

  const fetchCalculo = useCallback(async (driver: Driver, m: number, y: number) => {
    setCalculating(true)
    setCalculo(null)
    const res = await calcularNominaAction(driver.id, y, m, driver.salary, driver.hire_date)
    if (res.ok && res.data) {
      setCalculo(res.data)
      console.log('totalFavorCond:', res.data.totalFavorConductor)
      console.log('totalFavorEmpresa:', res.data.totalFavorEmpresa)
      console.log('legalizaciones:', res.data.legalizaciones)
      if (!skipAutoFillRef.current) {
        setTotalFavorCond(String(res.data.totalFavorConductor))
        setTotalFavorEmpresa(String(res.data.totalFavorEmpresa))
        setPrima(String(res.data.primaCalculada))
        setPrimaSource(res.data.primaSource)
      }
      skipAutoFillRef.current = false
    }
    setCalculating(false)
  }, [])

  useEffect(() => {
    if (!payingDriver) return
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => fetchCalculo(payingDriver, month, year), 300)
  }, [payingDriver, month, year, fetchCalculo])

  const openModal = (d: Driver) => {
    setPayingDriver(d)
    setIsEditMode(false)
    setTotalFavorCond('0'); setTotalFavorEmpresa('0')
    setPrima('0'); setPrimaSource(null)
    setOtherAdditions('0'); setOtherDeductions('0')
    setNotes(''); setSaveError(''); setCalculo(null)
  }

  const closeModal = () => {
    setPayingDriver(null)
    setIsEditMode(false)
    skipAutoFillRef.current = false
    if (debRef.current) clearTimeout(debRef.current)
  }

  const openEditModal = (d: Driver, p: Payroll) => {
    skipAutoFillRef.current = true
    setIsEditMode(true)
    setMonth(p.month)
    setYear(p.year)
    setTotalFavorCond(String(p.total_favor_conductor))
    setTotalFavorEmpresa(String(p.total_favor_empresa))
    setPrima(String(p.prima))
    setPrimaSource(null)
    setOtherAdditions(String(p.other_additions))
    setOtherDeductions(String(p.other_deductions))
    setNotes(p.notes ?? '')
    setSaveError(''); setCalculo(null)
    setPayingDriver(d)
  }

  const handleDeletePayroll = async () => {
    if (!deletePayrollTarget) return
    setDeletingPayroll(true)
    const res = await eliminarNominaAction(deletePayrollTarget.id)
    if (res.ok) {
      setDeletePayrollTarget(null)
      window.location.reload()
    } else {
      setDeletingPayroll(false)
    }
  }

  const toggleHistory = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const generarPDF = async (driver: Driver, calc: NominaCalculo) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    const mesLabel = MESES[month - 1]

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('COMPROBANTE DE PAGO DE NÓMINA', 105, 18, { align: 'center' })
    doc.setFontSize(11)
    doc.text('ISADAN TRANSPORTES S.A.S', 105, 25, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('NIT: 902030120-6', 105, 31, { align: 'center' })
    doc.text(`Período: ${mesLabel} de ${year}`, 105, 37, { align: 'center' })

    doc.setDrawColor(200, 200, 200)
    doc.line(15, 41, 195, 41)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('DATOS DEL EMPLEADO', 15, 48)
    doc.setFont('helvetica', 'normal')
    doc.text(`Empleado: ${driver.full_name}`, 15, 54)
    doc.text(`Cédula: ${driver.document}`, 15, 59)
    doc.text('Cargo: Conductor', 15, 64)
    doc.text(`Fecha de ingreso: ${driver.hire_date}`, 15, 69)
    doc.text(`Salario básico: ${formatCOP(driver.salary)}`, 15, 74)

    let currentY = 82

    if (calc.legalizaciones.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('DETALLE DE VIAJES DEL PERÍODO', 15, currentY)
      currentY += 4

      autoTable(doc, {
        startY: currentY,
        margin: { left: 15, right: 15 },
        head: [['Viaje', 'Ruta', 'Anticipo', 'Gastos', 'Balance', 'Resultado']],
        body: calc.legalizaciones.map((l: LegalizacionCalculo) => [
          l.trip?.trip_number ?? '—',
          l.trip ? `${l.trip.origin} → ${l.trip.destination}` : '—',
          formatCOP(l.advance_amount),
          formatCOP(l.total_expenses),
          (l.balance > 0 ? '+' : l.balance < 0 ? '-' : '') + formatCOP(Math.abs(l.balance)),
          l.balance > 0 ? 'Cond. debe' : l.balance < 0 ? 'Emp. debe' : 'Cuadrado',
        ]),
        styles: { fontSize: 7, cellPadding: 1.6, overflow: 'ellipsize' },
        headStyles: { fillColor: [37, 99, 235], fontSize: 7, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 70 },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 30 },
        },
      })
      currentY = (doc as any).lastAutoTable?.finalY + 8
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('LIQUIDACIÓN', 15, currentY)
    currentY += 4

    const rows: [string, string][] = [
      ['Salario básico mensual', formatCOP(driver.salary)],
    ]
    if (num(totalFavorCond) > 0)    rows.push(['(+) Saldo a favor conductor (viajes)', formatCOP(num(totalFavorCond))])
    if (num(totalFavorEmpresa) > 0) rows.push(['(-) Saldo a favor empresa (viajes)',   formatCOP(num(totalFavorEmpresa))])
    if (num(prima) > 0)             rows.push(['(+) Prima de servicios',       formatCOP(num(prima))])
    if (num(otherAdditions) > 0)    rows.push(['(+) Otras adiciones',          formatCOP(num(otherAdditions))])
    if (num(otherDeductions) > 0)   rows.push(['(-) Otras deducciones',        formatCOP(num(otherDeductions))])
    rows.push(['TOTAL A PAGAR', formatCOP(netPayment)])

    autoTable(doc, {
      startY: currentY,
      margin: { left: 15, right: 15 },
      body: rows,
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data: any) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fillColor   = [239, 246, 255]
          data.cell.styles.fontStyle   = 'bold'
          data.cell.styles.fontSize    = 10
          data.cell.styles.textColor   = [37, 99, 235]
        }
      },
    })

    const footerY = (doc as any).lastAutoTable?.finalY + 14

    doc.setDrawColor(200, 200, 200)
    doc.line(15, footerY, 195, footerY)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text('ISADAN TRANSPORTES S.A.S', 105, footerY + 7, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.text('NIT: 902030120-6', 105, footerY + 13, { align: 'center' })
    doc.text('Bello, Antioquia', 105, footerY + 18, { align: 'center' })

    doc.save(`Nomina_${driver.full_name.replace(/\s+/g, '_')}_${mesLabel}_${year}.pdf`)
  }

  const handleConfirmar = async () => {
    if (!payingDriver) return
    setSaving(true); setSaveError('')
    const fd = new FormData()
    fd.set('driver_id',             payingDriver.id)
    fd.set('year',                  String(year))
    fd.set('month',                 String(month))
    fd.set('base_salary',           String(payingDriver.salary))
    fd.set('total_favor_conductor', totalFavorCond)
    fd.set('total_favor_empresa',   totalFavorEmpresa)
    fd.set('prima',                 prima)
    fd.set('other_additions',       otherAdditions)
    fd.set('other_deductions',      otherDeductions)
    fd.set('notes',                 notes)

    const res = await guardarNominaAction(fd)
    if (!res.ok) { setSaveError(res.error ?? 'Error al guardar'); setSaving(false); return }

    if (calculo) await generarPDF(payingDriver, calculo)
    setSaving(false)
    closeModal()
    window.location.reload()
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Nómina conductores</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{drivers.length} conductor{drivers.length !== 1 ? 'es' : ''} activo{drivers.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Driver list */}
      <div className="space-y-3">
        {drivers.length === 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
            <Users size={32} className="mx-auto mb-3 text-[#CBD5E1]" />
            <p className="text-sm text-[#64748B]">No hay conductores activos registrados</p>
          </div>
        )}
        {drivers.map(d => {
          const expanded = expandedIds.has(d.id)
          const lastPayroll = d.payrollHistory[0] ?? null
          return (
            <div key={d.id} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              {/* Driver row */}
              <div className="px-4 sm:px-5 py-4">
                {/* Info row */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-700 text-xs font-bold">{d.full_name.slice(0,2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">{d.full_name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">C.C. {d.document} · Salario: {formatCOP(d.salary)}</p>
                    {/* Last payroll - mobile only */}
                    {lastPayroll && (
                      <p className="text-xs text-[#64748B] sm:hidden mt-0.5">
                        Último: {lastPayroll.period} · {formatCOP(lastPayroll.net_payment)}
                      </p>
                    )}
                  </div>
                  {/* Desktop: last payroll + actions */}
                  <div className="hidden sm:flex items-center gap-3 shrink-0">
                    {lastPayroll && (
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Último pago</p>
                        <p className="text-xs font-semibold text-[#0F172A]">{lastPayroll.period} · {formatCOP(lastPayroll.net_payment)}</p>
                      </div>
                    )}
                    <button
                      onClick={() => openModal(d)}
                      className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                      Pagar nómina
                    </button>
                    {d.payrollHistory.length > 0 && (
                      <button
                        onClick={() => toggleHistory(d.id)}
                        className="text-[#64748B] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile actions row */}
                <div className="flex items-center gap-2 mt-3 sm:hidden">
                  <button
                    onClick={() => openModal(d)}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors min-h-[44px]">
                    Pagar nómina
                  </button>
                  {d.payrollHistory.length > 0 && (
                    <button
                      onClick={() => toggleHistory(d.id)}
                      className="border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] p-2.5 rounded-lg hover:bg-[#F1F5F9] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Payroll history */}
              {expanded && d.payrollHistory.length > 0 && (
                <div className="border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  {/* Desktop table */}
                  <table className="w-full hidden md:table">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]">
                        {['Período','Salario base','Porcentaje','Saldo cond.','Saldo empresa','Prima','Total neto','Estado',''].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {d.payrollHistory.map(p => (
                        <tr key={p.id} className="hover:bg-white transition-colors">
                          <td className="px-4 py-2 text-xs font-medium text-[#0F172A]">{p.period}</td>
                          <td className="px-4 py-2 text-xs text-[#64748B]">{formatCOP(p.base_salary)}</td>
                          <td className="px-4 py-2 text-xs text-[#64748B]">{formatCOP(p.total_percentage)}</td>
                          <td className="px-4 py-2 text-xs text-green-700">{p.total_favor_conductor > 0 ? formatCOP(p.total_favor_conductor) : '—'}</td>
                          <td className="px-4 py-2 text-xs text-red-500">{p.total_favor_empresa > 0 ? formatCOP(p.total_favor_empresa) : '—'}</td>
                          <td className="px-4 py-2 text-xs text-[#64748B]">{p.prima > 0 ? formatCOP(p.prima) : '—'}</td>
                          <td className="px-4 py-2 text-xs font-bold text-[#0F172A]">{formatCOP(p.net_payment)}</td>
                          <td className="px-4 py-2">
                            {p.paid
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700"><CheckCircle2 size={9} /> Pagado</span>
                              : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">Pendiente</span>
                            }
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditModal(d, p)}
                                className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline font-medium"
                              >
                                <Pencil size={11} /> Editar
                              </button>
                              <button
                                onClick={() => setDeletePayrollTarget({ id: p.id, period: p.period, netPayment: p.net_payment })}
                                className="text-[#94A3B8] hover:text-red-500 transition-colors p-0.5"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobile history cards */}
                  <div className="md:hidden divide-y divide-[#E2E8F0]">
                    {d.payrollHistory.map(p => (
                      <div key={p.id} className="px-4 py-3 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0F172A]">{p.period}</p>
                            <p className="text-base font-bold text-[#0F172A] mt-0.5">{formatCOP(p.net_payment)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {p.paid
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700"><CheckCircle2 size={9} /> Pagado</span>
                              : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">Pendiente</span>
                            }
                            <button
                              onClick={() => openEditModal(d, p)}
                              className="text-[#2563EB] p-1.5 rounded-lg hover:bg-blue-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeletePayrollTarget({ id: p.id, period: p.period, netPayment: p.net_payment })}
                              className="text-[#94A3B8] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal de nómina ───────────────────────────────────────────────────── */}
      {payingDriver && (
        <div className="fixed inset-0 bg-black/40 flex sm:items-center sm:justify-center z-50 sm:p-4">
          <div className="bg-white w-full h-full sm:h-auto sm:rounded-2xl sm:max-w-2xl sm:max-h-[90vh] flex flex-col shadow-2xl">

            {/* Modal header — fixed */}
            <div className="border-b border-[#E2E8F0] px-4 sm:px-6 pt-4 pb-4 space-y-3 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-[#0F172A]">{isEditMode ? 'Editar' : 'Liquidar'} nómina — {payingDriver.full_name}</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">Salario base: {formatCOP(payingDriver.salary)}</p>
                </div>
                <button onClick={closeModal} className="mt-0.5 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center">
                  <X size={18} className="text-[#64748B]" />
                </button>
              </div>
              {/* Mes/año — single column on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Mes</label>
                  <select value={month} onChange={e => setMonth(Number(e.target.value))} className={inputCls}>
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Año</label>
                  <select value={year} onChange={e => setYear(Number(e.target.value))} className={inputCls}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Modal body — scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

              {/* Legalizations */}
              {calculating ? (
                <div className="flex items-center gap-2 py-4 justify-center text-[#64748B]">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Calculando...</span>
                </div>
              ) : calculo && (
                <div>
                  {calculo.legalizaciones.length === 0 ? (
                    <p className="text-xs text-[#94A3B8] text-center py-3 bg-[#F8FAFC] rounded-lg">
                      No hay legalizaciones aprobadas para este período
                    </p>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-[#64748B] mb-2">Legalizaciones del período</p>

                      {/* Desktop table */}
                      <div className="hidden sm:block border border-[#E2E8F0] rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Viaje</th>
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Ruta</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Anticipo</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Gastos</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Balance</th>
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Resultado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0]">
                            {calculo.legalizaciones.map(l => (
                              <tr key={l.id} className="hover:bg-[#F8FAFC]">
                                <td className="px-3 py-1.5 font-mono font-bold text-[#2563EB]">{l.trip?.trip_number ?? '—'}</td>
                                <td className="px-3 py-1.5 text-[#64748B] max-w-[140px] truncate">
                                  {l.trip ? `${l.trip.origin} → ${l.trip.destination}` : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right text-[#0F172A]">{formatCOP(l.advance_amount)}</td>
                                <td className="px-3 py-1.5 text-right text-[#0F172A]">{formatCOP(l.total_expenses)}</td>
                                <td className={`px-3 py-1.5 text-right font-semibold ${l.balance > 0 ? 'text-red-500' : l.balance < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                                  {l.balance > 0 ? '+' : l.balance < 0 ? '−' : ''}{formatCOP(Math.abs(l.balance))}
                                </td>
                                <td className={`px-3 py-1.5 font-medium ${l.balance > 0 ? 'text-red-500' : l.balance < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                                  {l.balance > 0 ? 'Conductor debe a empresa' : l.balance < 0 ? 'Empresa debe a conductor' : 'Cuadrado'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile legalizations cards */}
                      <div className="sm:hidden space-y-2">
                        {calculo.legalizaciones.map(l => (
                          <div key={l.id} className="border border-[#E2E8F0] rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-bold text-[#2563EB] text-sm">{l.trip?.trip_number ?? '—'}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                l.balance > 0 ? 'bg-red-50 text-red-600'
                                : l.balance < 0 ? 'bg-green-50 text-green-700'
                                : 'bg-[#F1F5F9] text-[#64748B]'
                              }`}>
                                {l.balance > 0 ? 'Conductor debe' : l.balance < 0 ? 'Empresa debe' : 'Cuadrado'}
                              </span>
                            </div>
                            <p className="text-xs text-[#64748B] mb-2 truncate">
                              {l.trip ? `${l.trip.origin} → ${l.trip.destination}` : '—'}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <p className="text-[10px] text-[#94A3B8] font-medium">Anticipo</p>
                                <p className="text-xs font-semibold text-[#0F172A]">{formatCOP(l.advance_amount)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[#94A3B8] font-medium">Gastos</p>
                                <p className="text-xs font-semibold text-[#0F172A]">{formatCOP(l.total_expenses)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[#94A3B8] font-medium">Balance</p>
                                <p className={`text-xs font-bold ${l.balance > 0 ? 'text-red-500' : l.balance < 0 ? 'text-green-700' : 'text-[#64748B]'}`}>
                                  {l.balance > 0 ? '+' : l.balance < 0 ? '−' : ''}{formatCOP(Math.abs(l.balance))}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Adjustments — single column on mobile */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Ajustes y deducciones</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Saldo a favor conductor (viajes)</label>
                    <input type="number" min="0" step="1" value={totalFavorCond}
                      onChange={e => setTotalFavorCond(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Saldo a favor empresa (descuento)</label>
                    <input type="number" min="0" step="1" value={totalFavorEmpresa}
                      onChange={e => setTotalFavorEmpresa(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Prima de servicios</label>
                    <input type="number" min="0" step="1" value={prima}
                      onChange={e => setPrima(e.target.value)} className={inputCls} />
                    {calculo && (
                      <p className={`text-[11px] mt-1 ${primaSource ? 'text-blue-600' : 'text-[#94A3B8]'}`}>
                        {primaSource
                          ? `Tomado de liquidación del ${primaSource.paidDate}`
                          : 'Sin prima liquidada — ingresa manualmente'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Otras adiciones</label>
                    <input type="number" min="0" step="1" value={otherAdditions}
                      onChange={e => setOtherAdditions(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Otras deducciones</label>
                    <input type="number" min="0" step="1" value={otherDeductions}
                      onChange={e => setOtherDeductions(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notas</label>
                  <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones adicionales..." className={`${inputCls} resize-none`} />
                </div>
              </div>

              {/* Liquidación final */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Liquidación</p>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-[#64748B]">Salario base</span>
                    <span className="text-sm font-semibold text-green-700">+{formatCOP(payingDriver.salary)}</span>
                  </div>
                  <LiqRow label="Saldo a favor conductor (viajes)" value={num(totalFavorCond)} />
                  <LiqRow label="Saldo a favor empresa (viajes)" value={num(totalFavorEmpresa)} sign="-" />
                  <LiqRow label="Prima de servicios" value={num(prima)} />
                  <LiqRow label="Otras adiciones" value={num(otherAdditions)} />
                  <LiqRow label="Otras deducciones" value={num(otherDeductions)} sign="-" />
                  <div className="border-t-2 border-[#0F172A] pt-2 mt-2 flex items-center justify-between">
                    <span className="text-base font-bold text-[#0F172A]">TOTAL NETO A PAGAR</span>
                    <span className="text-base font-bold text-[#2563EB]">= {formatCOP(netPayment)}</span>
                  </div>
                </div>
              </div>

              {saveError && <p className="text-sm text-red-500 font-medium">{saveError}</p>}
            </div>

            {/* Modal footer — fixed at bottom */}
            <div className="border-t border-[#E2E8F0] px-4 sm:px-6 py-4 flex gap-3 flex-shrink-0 bg-white">
              <button onClick={closeModal}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors min-h-[44px]">
                Cancelar
              </button>
              <button onClick={handleConfirmar} disabled={saving || netPayment <= 0}
                className="flex-1 flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors min-h-[44px]">
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                  : <><FileDown size={14} /> {isEditMode ? 'Guardar cambios' : 'Confirmar y descargar PDF'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmación eliminar nómina ──────────────────────────────────────── */}
      {deletePayrollTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar nómina</h2>
            <p className="text-sm text-[#64748B]">
              ¿Eliminar la nómina de{' '}
              <span className="font-medium text-[#0F172A]">{deletePayrollTarget.period}</span>{' '}
              ({formatCOP(deletePayrollTarget.netPayment)})? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletePayrollTarget(null)}
                disabled={deletingPayroll}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePayroll}
                disabled={deletingPayroll}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm min-h-[44px]"
              >
                {deletingPayroll ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
