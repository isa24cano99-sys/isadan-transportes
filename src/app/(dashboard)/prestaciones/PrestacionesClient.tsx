'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { X, Users, FileText, UserMinus, Trash2, ChevronDown, Download, Loader2 } from 'lucide-react'
import { formatCOP, formatDate } from '@/lib/utils'
import { guardarPrestacionesAction, eliminarPrestacionAction, eliminarEmpleadoAction } from './actions'
import { hoyColombia } from '@/lib/fecha'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fechaLarga(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

function fechaCorta(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`
}

type LiquidationType = 'solo_prima' | 'completa'

interface CalcResult {
  valid: boolean
  diasGeneral: number
  diasPrima: number
  primaDesde: string
  primaHasta: string
  cesantias: number
  intereses: number
  prima: number
  vacaciones: number
  total: number
}

const emptyCalc: CalcResult = {
  valid: false, diasGeneral: 0, diasPrima: 0,
  primaDesde: '', primaHasta: '',
  cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, total: 0,
}

function calcular(
  salary: number,
  liqType: LiquidationType,
  inicioSoloPrima: string,
  finSoloPrima: string,
  inicio: string,
  iniciosPrima: string,
  fin: string,
): CalcResult {
  if (liqType === 'solo_prima') {
    if (!inicioSoloPrima || !finSoloPrima) return emptyCalc
    const dp = Math.max(0, Math.round(
      (new Date(finSoloPrima + 'T00:00:00').getTime() - new Date(inicioSoloPrima + 'T00:00:00').getTime()) / 86_400_000
    ))
    if (dp <= 0) return emptyCalc
    const prima = Math.round((salary * dp) / 360)
    return {
      valid: true,
      diasGeneral: dp, diasPrima: dp,
      primaDesde: inicioSoloPrima, primaHasta: finSoloPrima,
      cesantias: 0, intereses: 0, prima, vacaciones: 0, total: prima,
    }
  }

  // completa
  if (!inicio || !iniciosPrima || !fin) return emptyCalc
  const s  = new Date(inicio       + 'T00:00:00')
  const ip = new Date(iniciosPrima + 'T00:00:00')
  const e  = new Date(fin          + 'T00:00:00')
  const diasGeneral = Math.max(0, Math.round((e.getTime() - s.getTime())  / 86_400_000))
  const diasPrima   = Math.max(0, Math.round((e.getTime() - ip.getTime()) / 86_400_000))
  if (diasGeneral <= 0 || diasPrima <= 0) return emptyCalc
  const cesantias  = Math.round((salary * diasGeneral) / 360)
  const intereses  = Math.round(cesantias * 0.12)          // 12% fijo anual — NO proporcional
  const vacaciones = Math.round((salary * diasGeneral) / 720)
  const prima      = Math.round((salary * diasPrima) / 360)
  return {
    valid: true,
    diasGeneral, diasPrima,
    primaDesde: iniciosPrima, primaHasta: fin,
    cesantias, intereses, prima, vacaciones,
    total: cesantias + intereses + prima + vacaciones,
  }
}

// ── PDF generator ─────────────────────────────────────────────────────────────

async function generarPDF(params: {
  liqType: LiquidationType
  modalType: 'anual' | 'desvinculacion'
  employee: Employee
  calc: CalcResult
  inicio: string
  fin: string
}) {
  const { jsPDF } = await import('jspdf')
  const { liqType, modalType, employee, calc, inicio, fin } = params

  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const mL    = 20
  const cW    = pageW - 40
  let y       = 20

  const sf = (bold: boolean, size = 10) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
  }
  const ln  = (mm = 5) => { y += mm }
  const txt = (text: string, x = mL) => { doc.text(text, x, y) }
  const wrapped = (text: string, bold = false, size = 10) => {
    sf(bold, size)
    const lines = doc.splitTextToSize(text, cW) as string[]
    doc.text(lines, mL, y)
    y += lines.length * 5
  }

  // Title
  sf(true, 11)
  const title = liqType === 'solo_prima'
    ? 'CONSTANCIA DE PAGO DE PRIMA DE SERVICIOS'
    : 'CONSTANCIA DE LIQUIDACIÓN Y PAGO DE PRESTACIONES SOCIALES'
  const titleLines = doc.splitTextToSize(title, cW) as string[]
  doc.text(titleLines, pageW / 2, y, { align: 'center' })
  y += titleLines.length * 7
  ln(3)

  sf(false, 10)
  const hoy = new Date()
  txt(`${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`)
  ln(7)
  txt(`Señor(a): ${employee.full_name}`)
  ln(7)

  // Paragraph
  if (liqType === 'solo_prima') {
    wrapped(
      `Por medio de la presente se deja constancia que la empresa realizó el pago de prima de servicios ` +
      `correspondiente al período comprendido entre ${fechaLarga(calc.primaDesde)} y ` +
      `${fechaLarga(calc.primaHasta)}, encontrándose el trabajador aún vinculado a la empresa.`,
    )
  } else if (modalType === 'anual') {
    wrapped(
      `Por medio de la presente se deja constancia que la empresa realizó la liquidación de prestaciones ` +
      `sociales correspondiente al período comprendido entre ${fechaLarga(inicio)} y ${fechaLarga(fin)}, ` +
      `encontrándose el trabajador aún vinculado a la empresa.`,
    )
  } else {
    wrapped(
      'Por medio de la presente se deja constancia que la empresa realizó la liquidación definitiva de ' +
      'prestaciones sociales correspondiente a la terminación del contrato de trabajo por renuncia voluntaria.',
    )
  }
  ln(5)

  sf(true, 10); txt('Información laboral:'); ln()
  sf(false, 10)
  txt(`Fecha de ingreso: ${fechaLarga(employee.hire_date)}`); ln()
  if (liqType === 'completa' && modalType === 'desvinculacion') {
    txt(`Fecha de retiro: ${fechaLarga(fin)}`); ln()
  }
  txt(`Salario básico mensual: ${formatCOP(employee.salary)}`); ln(8)

  // Table
  const c1 = 115; const c2 = cW - c1
  const rH = 8;   const tP = 3;  const tB = 5.5

  const fila = (label: string, value: string, fill?: [number, number, number], bold = false) => {
    const ry = y
    if (fill) {
      doc.setFillColor(...fill)
      doc.rect(mL, ry, c1, rH, 'FD'); doc.rect(mL + c1, ry, c2, rH, 'FD')
    } else {
      doc.rect(mL, ry, c1, rH); doc.rect(mL + c1, ry, c2, rH)
    }
    sf(bold, 10)
    doc.text(label, mL + tP, ry + tB); doc.text(value, mL + c1 + tP, ry + tB)
    y += rH
  }

  fila('Concepto', 'Valor', [241, 245, 249], true)

  if (liqType === 'solo_prima') {
    fila(
      `Prima de servicios (${fechaCorta(calc.primaDesde)} – ${fechaCorta(calc.primaHasta)})`,
      formatCOP(calc.prima),
    )
  } else {
    fila(`Cesantías (${fechaCorta(inicio)} – ${fechaCorta(fin)})`, formatCOP(calc.cesantias))
    fila('Intereses sobre cesantías 12%', formatCOP(calc.intereses))
    fila(
      `Prima proporcional (${fechaCorta(calc.primaDesde)} – ${fechaCorta(fin)})`,
      formatCOP(calc.prima),
    )
    fila(`Vacaciones (${fechaCorta(inicio)} – ${fechaCorta(fin)})`, formatCOP(calc.vacaciones))
  }

  fila('TOTAL PAGADO', formatCOP(calc.total), [226, 232, 240], true)
  ln(5)

  if (liqType === 'solo_prima' || modalType === 'anual') {
    wrapped('El trabajador continúa vinculado a la empresa.')
  } else {
    wrapped(
      'El trabajador manifiesta recibir a satisfacción la suma anteriormente relacionada por concepto de ' +
      'liquidación definitiva de prestaciones sociales y demás acreencias laborales derivadas de la relación laboral.',
    )
  }
  ln(10)

  sf(false, 10)
  txt('Firma del empleador: ___________________________________________'); ln()
  txt('Nombre: Jhon Jairo Cano Valencia');                               ln()
  txt('Cargo: Representante Legal');                                       ln()
  txt('Empresa: ISADAN Transportes SAS');                                  ln()
  txt('NIT: 902030120');                                                   ln()
  txt('C.C.: 70134065');                                                   ln(10)
  txt('Firma del trabajador: ___________________________________________'); ln()
  txt(`Nombre: ${employee.full_name}`);                                    ln()
  txt(`C.C.: ${employee.document}`)

  const safeName = employee.full_name.replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`liquidacion_${safeName}_${hoyColombia()}.pdf`)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Employee = {
  id: string
  full_name: string
  document: string
  hire_date: string
  salary: number
  active: boolean
  sourceType: 'empleado' | 'conductor'
}

type PersonaJoin = {
  full_name: string
  document: string
  hire_date: string
  salary: number
}

type HistorialRow = {
  id: string
  period: string | null
  cesantias: number | null
  intereses: number | null
  prima: number | null
  vacaciones: number | null
  paid_date: string | null
  employees: PersonaJoin | null
  drivers:   PersonaJoin | null
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function LiquidacionModal({
  employee,
  type,
  onClose,
}: {
  employee: Employee
  type: 'anual' | 'desvinculacion'
  onClose: () => void
}) {
  const router = useRouter()

  const [liqType,          setLiqType]          = useState<LiquidationType>('completa')
  const [inicioSoloPrima,  setInicioSoloPrima]  = useState('')
  const [finSoloPrima,     setFinSoloPrima]     = useState('')
  const [inicio,           setInicio]           = useState('')
  const [iniciosPrima,     setIniciosPrima]     = useState('')
  const [fin,              setFin]              = useState('')
  const [paidDate,         setPaidDate]         = useState(hoyColombia())
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')

  const calc = useMemo(
    () => calcular(employee.salary, liqType, inicioSoloPrima, finSoloPrima, inicio, iniciosPrima, fin),
    [employee.salary, liqType, inicioSoloPrima, finSoloPrima, inicio, iniciosPrima, fin],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!calc.valid) { setError('Completa los campos del período'); return }
    setLoading(true); setError('')

    let period: string
    if (liqType === 'solo_prima') {
      const year = new Date(finSoloPrima + 'T00:00:00').getFullYear()
      period = `${year}-PRIMA`
    } else {
      const endDate = new Date(fin + 'T00:00:00')
      const year    = endDate.getFullYear()
      const month   = endDate.getMonth() + 1
      period = type === 'desvinculacion'
        ? `${year}-LIQ`
        : month <= 6 ? `${year}-S1` : `${year}-S2`
    }

    const result = await guardarPrestacionesAction({
      entity_type: employee.sourceType === 'conductor' ? 'DRIVER' : 'EMPLOYEE',
      entity_id:   employee.id,
      period,
      cesantias:  calc.cesantias,
      intereses:  calc.intereses,
      prima:      calc.prima,
      vacaciones: calc.vacaciones,
      paid_date:  paidDate,
    })

    if (!result.ok) { setError(result.error ?? 'Error al guardar'); setLoading(false); return }

    await generarPDF({ liqType, modalType: type, employee, calc, inicio, fin })
    router.refresh()
    onClose()
  }

  const inputCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
  const labelCls = 'block text-xs font-semibold text-[#64748B] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">
              {type === 'anual' ? 'Liquidación de prestaciones' : 'Desvinculación de empleado'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">{employee.full_name}</p>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Badge + Fecha de pago */}
          <div className="flex items-center justify-between gap-4">
            <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full ${
              type === 'anual' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {type === 'anual' ? 'Pago anual' : 'Desvinculación'}
            </span>
            <div className="flex items-center gap-2">
              <label className={labelCls + ' mb-0'}>Fecha de pago</label>
              <input
                type="date"
                value={paidDate}
                onChange={e => setPaidDate(e.target.value)}
                className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Liquidation type selector — only shown for 'anual' */}
          {type !== 'desvinculacion' && (
            <div className="grid grid-cols-2 gap-2">
              {(['solo_prima', 'completa'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLiqType(t)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    liqType === t
                      ? t === 'solo_prima'
                        ? 'bg-purple-50 border-purple-300 text-purple-700'
                        : 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {t === 'solo_prima' ? 'Solo prima' : 'Prestaciones completas'}
                </button>
              ))}
            </div>
          )}

          {/* ── Solo prima fields ── */}
          {liqType === 'solo_prima' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fecha inicio prima *</label>
                <input
                  type="date"
                  value={inicioSoloPrima}
                  onChange={e => setInicioSoloPrima(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Fecha fin prima *</label>
                <input
                  type="date"
                  value={finSoloPrima}
                  onChange={e => setFinSoloPrima(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ── Completa fields ── */}
          {liqType === 'completa' && (
            <>
              <div>
                <p className="text-xs font-semibold text-[#64748B] mb-2">
                  Período general — cesantías, intereses y vacaciones
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Fecha inicio *</label>
                    <input
                      type="date"
                      value={inicio}
                      onChange={e => setInicio(e.target.value)}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Fecha fin *</label>
                    <input
                      type="date"
                      value={fin}
                      onChange={e => setFin(e.target.value)}
                      required
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#64748B] mb-2">
                  Prima — desde el último pago de prima
                </p>
                <label className={labelCls}>Última prima pagada el *</label>
                <input
                  type="date"
                  value={iniciosPrima}
                  onChange={e => setIniciosPrima(e.target.value)}
                  required
                  className={inputCls}
                />
                {iniciosPrima && fin && (
                  <p className="text-[11px] text-[#64748B] mt-1.5">
                    Prima: {fechaLarga(iniciosPrima)} al {fechaLarga(fin)}
                    {calc.valid && ` (${calc.diasPrima} días)`}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Calculation table ── */}
          {calc.valid && (
            <div>
              {liqType === 'solo_prima' ? (
                <p className="text-xs text-[#64748B] mb-3">
                  Días:{' '}
                  <span className="font-semibold text-[#0F172A]">{calc.diasPrima}</span>
                  {' · '}Salario:{' '}
                  <span className="font-semibold text-[#0F172A]">{formatCOP(employee.salary)}</span>
                </p>
              ) : (
                <p className="text-xs text-[#64748B] mb-3">
                  Días período:{' '}
                  <span className="font-semibold text-[#0F172A]">{calc.diasGeneral}</span>
                  {' · '}Días prima:{' '}
                  <span className="font-semibold text-[#0F172A]">{calc.diasPrima}</span>
                  {' · '}Salario:{' '}
                  <span className="font-semibold text-[#0F172A]">{formatCOP(employee.salary)}</span>
                </p>
              )}

              <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B]">Concepto</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#64748B]">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {liqType === 'solo_prima' ? (
                      <tr>
                        <td className="px-4 py-2.5 text-[#64748B]">Prima de servicios</td>
                        <td className="px-4 py-2.5 text-right font-medium text-[#0F172A]">{formatCOP(calc.prima)}</td>
                      </tr>
                    ) : (
                      <>
                        {([
                          ['Cesantías',                       calc.cesantias],
                          ['Intereses sobre cesantías (12%)', calc.intereses],
                          ['Prima de servicios',              calc.prima],
                          ['Vacaciones',                      calc.vacaciones],
                        ] as [string, number][]).map(([label, val]) => (
                          <tr key={label}>
                            <td className="px-4 py-2.5 text-[#64748B]">{label}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-[#0F172A]">{formatCOP(val)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                    <tr className="bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-bold text-[#0F172A]">TOTAL</td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#2563EB]">{formatCOP(calc.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !calc.valid}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Generando...' : 'Guardar y descargar PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Regenerar PDF desde historial ─────────────────────────────────────────────

async function descargarPDFHistorial(row: HistorialRow) {
  const persona = row.employees ?? row.drivers
  if (!persona) return

  const period   = row.period   ?? ''
  const paidDate = row.paid_date ?? hoyColombia()
  const hireDate = persona.hire_date ?? paidDate

  const liqType: LiquidationType   = period.endsWith('PRIMA') ? 'solo_prima' : 'completa'
  const modalType: 'anual' | 'desvinculacion' = period.endsWith('LIQ') ? 'desvinculacion' : 'anual'

  // Derivar fechas aproximadas del código de período
  const year = parseInt(period.split('-')[0]) || new Date().getFullYear()
  let inicio = hireDate, fin = paidDate
  let primaDesde = hireDate, primaHasta = paidDate

  if (period.endsWith('S1')) {
    inicio = `${year}-01-01`; fin = `${year}-06-30`
    primaDesde = inicio; primaHasta = fin
  } else if (period.endsWith('S2')) {
    inicio = `${year}-07-01`; fin = `${year}-12-31`
    primaDesde = inicio; primaHasta = fin
  } else if (period.endsWith('PRIMA')) {
    primaDesde = `${year}-01-01`; primaHasta = `${year}-06-30`
    inicio = primaDesde; fin = primaHasta
  } else if (period.endsWith('LIQ')) {
    inicio = hireDate; fin = paidDate
    primaDesde = hireDate; primaHasta = paidDate
  }

  const ms = (d: string) => new Date(d + 'T00:00:00').getTime()
  const diasGeneral = Math.max(0, Math.round((ms(fin) - ms(inicio)) / 86_400_000))
  const diasPrima   = Math.max(0, Math.round((ms(primaHasta) - ms(primaDesde)) / 86_400_000))

  const cesantias  = row.cesantias  ?? 0
  const intereses  = row.intereses  ?? 0
  const prima      = row.prima      ?? 0
  const vacaciones = row.vacaciones ?? 0

  const employee: Employee = {
    id:         '',
    full_name:  persona.full_name,
    document:   persona.document  ?? '',
    hire_date:  hireDate,
    salary:     Number(persona.salary ?? 0),
    active:     true,
    sourceType: row.employees ? 'empleado' : 'conductor',
  }

  const calc: CalcResult = {
    valid: true,
    diasGeneral, diasPrima,
    primaDesde, primaHasta,
    cesantias, intereses, prima, vacaciones,
    total: cesantias + intereses + prima + vacaciones,
  }

  await generarPDF({ liqType, modalType, employee, calc, inicio, fin })
}

function DescargarPDFButton({ row }: { row: HistorialRow }) {
  const [loading, setLoading] = useState(false)
  const persona = row.employees ?? row.drivers
  if (!persona) return null

  const handleClick = async () => {
    setLoading(true)
    await descargarPDFHistorial(row)
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Descargar PDF"
      className="text-[#94A3B8] hover:text-[#2563EB] transition-colors p-0.5 disabled:opacity-50"
    >
      {loading
        ? <Loader2 size={13} className="animate-spin" />
        : <Download size={13} />
      }
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PrestacionesClient({ personas, historial: initialHistorial }: { personas: Employee[]; historial: HistorialRow[] }) {
  const [modal, setModal] = useState<{ employee: Employee; type: 'anual' | 'desvinculacion' } | null>(null)
  const [historial,     setHistorial]     = useState(initialHistorial)
  const [selectedId,    setSelectedId]    = useState('')
  const [deleteHist,    setDeleteHist]    = useState<HistorialRow | null>(null)
  const [deleteEmp,     setDeleteEmp]     = useState<Employee | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [personas_,     setPersonas_]     = useState(personas)

  const selected = personas_.find(e => e.id === selectedId) ?? null

  const handleDeleteHistorial = async () => {
    if (!deleteHist) return
    setDeleting(true)
    const res = await eliminarPrestacionAction(deleteHist.id)
    if (res.ok) {
      setHistorial(prev => prev.filter(h => h.id !== deleteHist.id))
      setDeleteHist(null)
    }
    setDeleting(false)
  }

  const handleDeleteEmpleado = async () => {
    if (!deleteEmp) return
    setDeleting(true)
    const res = await eliminarEmpleadoAction(deleteEmp.id)
    if (res.ok) {
      setPersonas_(prev => prev.filter(e => e.id !== deleteEmp.id))
      setHistorial(prev => prev.filter(h => (h as any).employee_id !== deleteEmp.id))
      setSelectedId('')
      setDeleteEmp(null)
    }
    setDeleting(false)
  }

  return (
    <>
      {modal && (
        <LiquidacionModal
          employee={modal.employee}
          type={modal.type}
          onClose={() => setModal(null)}
        />
      )}

      {/* Persona selector */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#64748B] mb-2">Empleado / Conductor</label>
        <div className="relative w-96">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full appearance-none border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-9"
          >
            <option value="">Seleccionar…</option>
            {personas_.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.sourceType === 'conductor' ? 'Conductor' : 'Empleado'})
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
        </div>
        {personas_.length === 0 && (
          <p className="text-xs text-[#94A3B8] mt-2">No hay empleados ni conductores activos</p>
        )}
      </div>

      {/* Selected person card */}
      {selected && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 max-w-sm mb-8">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-[#0F172A]">{selected.full_name}</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                selected.sourceType === 'conductor'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {selected.sourceType === 'conductor' ? 'Conductor' : 'Empleado'}
              </span>
            </div>
            <p className="text-xs text-[#64748B]">C.C. {selected.document}</p>
          </div>
          <div className="space-y-1.5 mb-5">
            <div className="flex justify-between">
              <span className="text-xs text-[#64748B]">Fecha de ingreso</span>
              <span className="text-xs font-medium text-[#0F172A]">{formatDate(selected.hire_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-[#64748B]">Salario</span>
              <span className="text-xs font-bold text-[#0F172A]">{formatCOP(selected.salary)}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setModal({ employee: selected, type: 'anual' })}
              className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <FileText size={12} />
              Liquidar prestaciones
            </button>
            <button
              onClick={() => setModal({ employee: selected, type: 'desvinculacion' })}
              className="flex items-center gap-1.5 border border-orange-200 text-orange-600 hover:bg-orange-50 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <UserMinus size={12} />
              Desvincular
            </button>
            {selected.sourceType === 'empleado' && (
              <button
                onClick={() => setDeleteEmp(selected)}
                className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Trash2 size={12} />
                Eliminar empleado
              </button>
            )}
          </div>
        </div>
      )}

      {/* Historial */}
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A] mb-4">
          Historial de liquidaciones
          <span className="ml-2 text-xs font-normal text-[#64748B]">{historial.length} registros</span>
        </h2>
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Empleado</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Período</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Cesantías</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Intereses</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Prima</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Vacaciones</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Total</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Fecha pago</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-xs text-[#64748B]">
                    No hay liquidaciones registradas
                  </td>
                </tr>
              ) : historial.map(b => {
                const total   = (b.cesantias ?? 0) + (b.intereses ?? 0) + (b.prima ?? 0) + (b.vacaciones ?? 0)
                const period  = String(b.period ?? '')
                const isLiq   = period.endsWith('LIQ')
                const isPrima = period.endsWith('PRIMA')
                return (
                  <tr key={b.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-3 py-2 text-xs font-medium text-[#0F172A]">
                      {b.employees?.full_name ?? b.drivers?.full_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{b.period}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(b.cesantias ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(b.intereses ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(b.prima ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-[#0F172A] text-right">{formatCOP(b.vacaciones ?? 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-[#0F172A] text-right">{formatCOP(total)}</td>
                    <td className="px-3 py-2 text-xs text-[#64748B]">{b.paid_date ? formatDate(b.paid_date) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                        isLiq   ? 'bg-orange-100 text-orange-700' :
                        isPrima ? 'bg-purple-100 text-purple-700' :
                                  'bg-blue-100 text-blue-700'
                      }`}>
                        {isLiq ? 'Desvinculación' : isPrima ? 'Solo prima' : 'Pago anual'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <DescargarPDFButton row={b} />
                        <button onClick={() => setDeleteHist(b)}
                          className="text-[#94A3B8] hover:text-red-500 transition-colors p-0.5">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete historial modal */}
      {deleteHist && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar liquidacion</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara la liquidacion{' '}
              <span className="font-medium text-[#0F172A]">{deleteHist.period}</span>{' '}
              de <span className="font-medium text-[#0F172A]">{deleteHist.employees?.full_name ?? deleteHist.drivers?.full_name ?? '—'}</span> de forma permanente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteHist(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDeleteHistorial} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete employee modal */}
      {deleteEmp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar empleado</h2>
            <p className="text-xs text-[#64748B]">
              Se eliminara <span className="font-medium text-[#0F172A]">{deleteEmp.full_name}</span> y todos sus registros de prestaciones de forma permanente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteEmp(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDeleteEmpleado} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
