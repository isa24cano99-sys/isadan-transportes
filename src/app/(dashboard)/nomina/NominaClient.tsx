'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatCOP, formatDate } from '@/lib/utils'
import {
  Users, ChevronDown, ChevronUp, Loader2, CheckCircle2, X, FileDown,
} from 'lucide-react'
import { calcularNominaAction, guardarNominaAction, type NominaCalculo } from './actions'

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

const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
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
  const [totalPercentage,   setTotalPercentage]   = useState('0')
  const [totalFavorCond,    setTotalFavorCond]    = useState('0')
  const [totalFavorEmpresa, setTotalFavorEmpresa] = useState('0')
  const [prima,             setPrima]             = useState('0')
  const [otherAdditions,    setOtherAdditions]    = useState('0')
  const [otherDeductions,   setOtherDeductions]   = useState('0')
  const [notes,             setNotes]             = useState('')
  const [saving,            setSaving]            = useState(false)
  const [saveError,         setSaveError]         = useState('')
  const [expandedIds,       setExpandedIds]       = useState<Set<string>>(new Set())
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const num = (s: string) => parseFloat(s) || 0

  const netPayment =
    (payingDriver?.salary ?? 0)
    + num(totalPercentage)
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
      setTotalPercentage(String(res.data.totalPercentage))
      setTotalFavorCond(String(res.data.totalFavorConductor))
      setTotalFavorEmpresa(String(res.data.totalFavorEmpresa))
      setPrima(String(res.data.primaCalculada))
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
    setTotalPercentage('0'); setTotalFavorCond('0'); setTotalFavorEmpresa('0')
    setPrima('0'); setOtherAdditions('0'); setOtherDeductions('0')
    setNotes(''); setSaveError(''); setCalculo(null)
  }

  const closeModal = () => {
    setPayingDriver(null)
    if (debRef.current) clearTimeout(debRef.current)
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

    // Header
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

    // Empleado
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

    // Detalle de viajes
    if (calc.legalizaciones.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('DETALLE DE VIAJES DEL PERÍODO', 15, currentY)
      currentY += 4

      autoTable(doc, {
        startY: currentY,
        head: [['Viaje', 'Ruta', 'Porcentaje', 'Balance']],
        body: calc.legalizaciones.map(l => [
          l.trip?.trip_number ?? '—',
          l.trip ? `${l.trip.origin} → ${l.trip.destination}` : '—',
          formatCOP(l.porcentaje),
          formatCOP(l.balance),
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 7.5 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      currentY = (doc as any).lastAutoTable?.finalY + 8
    }

    // Liquidación
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('LIQUIDACIÓN', 15, currentY)
    currentY += 4

    const rows: [string, string][] = [
      ['Salario básico mensual', formatCOP(driver.salary)],
      ['(+) Porcentaje de viajes', formatCOP(num(totalPercentage))],
    ]
    if (num(totalFavorCond) > 0)    rows.push(['(+) Saldo a favor conductor', formatCOP(num(totalFavorCond))])
    if (num(totalFavorEmpresa) > 0) rows.push(['(-) Saldo a favor empresa',   formatCOP(num(totalFavorEmpresa))])
    if (num(prima) > 0)             rows.push(['(+) Prima de servicios',       formatCOP(num(prima))])
    if (num(otherAdditions) > 0)    rows.push(['(+) Otras adiciones',          formatCOP(num(otherAdditions))])
    if (num(otherDeductions) > 0)   rows.push(['(-) Otras deducciones',        formatCOP(num(otherDeductions))])
    rows.push(['TOTAL A PAGAR', formatCOP(netPayment)])

    autoTable(doc, {
      startY: currentY,
      body: rows,
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
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

    // Footer
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
    fd.set('driver_id',            payingDriver.id)
    fd.set('year',                 String(year))
    fd.set('month',                String(month))
    fd.set('base_salary',          String(payingDriver.salary))
    fd.set('total_percentage',     totalPercentage)
    fd.set('total_favor_conductor', totalFavorCond)
    fd.set('total_favor_empresa',  totalFavorEmpresa)
    fd.set('prima',                prima)
    fd.set('other_additions',      otherAdditions)
    fd.set('other_deductions',     otherDeductions)
    fd.set('notes',                notes)

    const res = await guardarNominaAction(fd)
    if (!res.ok) { setSaveError(res.error ?? 'Error al guardar'); setSaving(false); return }

    if (calculo) await generarPDF(payingDriver, calculo)
    setSaving(false)
    closeModal()
    window.location.reload()
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
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
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-700 text-xs font-bold">{d.full_name.slice(0,2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{d.full_name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">C.C. {d.document} · Salario: {formatCOP(d.salary)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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

              {/* History */}
              {expanded && d.payrollHistory.length > 0 && (
                <div className="border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]">
                        {['Período','Salario base','Porcentaje','Saldo cond.','Saldo empresa','Prima','Total neto','Estado'].map(h => (
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal de nómina ───────────────────────────────────────────────────── */}
      {payingDriver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="font-semibold text-[#0F172A]">Liquidar nómina — {payingDriver.full_name}</h2>
                <p className="text-xs text-[#64748B] mt-0.5">Salario base: {formatCOP(payingDriver.salary)}</p>
              </div>
              <button onClick={closeModal}><X size={18} className="text-[#64748B]" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Period selector */}
              <div className="grid grid-cols-2 gap-4">
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

              {/* Legalization detail */}
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
                      <p className="text-xs font-semibold text-[#64748B] mb-2">Legalizaciones aprobadas del período</p>
                      <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Viaje</th>
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Ruta</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Porcentaje</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0]">
                            {calculo.legalizaciones.map(l => (
                              <tr key={l.id} className="hover:bg-[#F8FAFC]">
                                <td className="px-3 py-1.5 text-xs font-mono font-bold text-[#2563EB]">{l.trip?.trip_number ?? '—'}</td>
                                <td className="px-3 py-1.5 text-xs text-[#64748B]">
                                  {l.trip ? `${l.trip.origin} → ${l.trip.destination}` : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-right font-medium text-green-700">{formatCOP(l.porcentaje)}</td>
                                <td className={`px-3 py-1.5 text-xs text-right font-semibold ${l.balance >= 0 ? 'text-green-700' : 'text-red-500'}`}>
                                  {l.balance < 0 ? '−' : '+'}{formatCOP(Math.abs(l.balance))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Editable amounts */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Componentes del pago</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Porcentaje de viajes (COP)</label>
                    <input type="number" min="0" step="1" value={totalPercentage}
                      onChange={e => setTotalPercentage(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Saldo a favor conductor</label>
                    <input type="number" min="0" step="1" value={totalFavorCond}
                      onChange={e => setTotalFavorCond(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Saldo a favor empresa (descuento)</label>
                    <input type="number" min="0" step="1" value={totalFavorEmpresa}
                      onChange={e => setTotalFavorEmpresa(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Prima de servicios {(month === 6 || month === 12) && <span className="text-blue-500">(aplica)</span>}
                    </label>
                    <input type="number" min="0" step="1" value={prima}
                      onChange={e => setPrima(e.target.value)} className={inputCls} />
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
                  <LiqRow label="Porcentaje viajes del mes" value={num(totalPercentage)} />
                  <LiqRow label="Saldo a favor conductor" value={num(totalFavorCond)} />
                  <LiqRow label="Saldo a favor empresa" value={num(totalFavorEmpresa)} sign="-" />
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

            {/* Modal footer */}
            <div className="border-t border-[#E2E8F0] px-6 py-4 flex gap-3">
              <button onClick={closeModal}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors">
                Cancelar
              </button>
              <button onClick={handleConfirmar} disabled={saving || netPayment <= 0}
                className="flex-1 flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                  : <><FileDown size={14} /> Confirmar y descargar PDF</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
