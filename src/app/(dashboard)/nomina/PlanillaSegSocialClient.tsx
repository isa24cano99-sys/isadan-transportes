'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  getPlanillaSegSocialAction,
  registrarPagoSegSocialAction,
  type SegSocialRow,
  type PlanillaPagada,
} from './social-security-actions'

const RATES = { pension: 0.16, salud: 0.04, ccf: 0.04, arl: 0.0435 }
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
               'Septiembre','Octubre','Noviembre','Diciembre']
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

type Driver      = { id: string; full_name: string; document: string; salary: number }
type BankAccount = { id: string; bank_name: string }

interface Props {
  drivers:      Driver[]
  bankAccounts: BankAccount[]
}

function calcRow(d: Driver, days: number): SegSocialRow {
  const ibc     = d.salary * days / 30
  const pension = Math.round(ibc * RATES.pension)
  const salud   = Math.round(ibc * RATES.salud)
  const ccf     = Math.round(ibc * RATES.ccf)
  const arl     = Math.round(ibc * RATES.arl)
  return { driver_id: d.id, driver_name: d.full_name, document: d.document,
           salary: d.salary, days, ibc, pension, salud, ccf, arl,
           total: pension + salud + ccf + arl }
}

export default function PlanillaSegSocialClient({ drivers, bankAccounts }: Props) {
  const now  = new Date()
  const [isOpen, setIsOpen] = useState(false)
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(now.getFullYear())
  const [daysMap, setDaysMap] = useState<Record<string, number>>(
    () => Object.fromEntries(drivers.map(d => [d.id, 30])))
  const [existingPlanilla, setExisting] = useState<PlanillaPagada | null>(null)
  const [loadingPlanilla, setLoading]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [accountId, setAccountId] = useState(bankAccounts[0]?.id ?? '')
  const [paidDate, setPaidDate]   = useState(now.toISOString().slice(0, 10))
  const [pdfLoading, setPdfLoading] = useState(false)

  const rows = useMemo(
    () => drivers.map(d => calcRow(d, daysMap[d.id] ?? 30)),
    [drivers, daysMap],
  )
  const totals = useMemo(() => ({
    pension:    rows.reduce((s, r) => s + r.pension, 0),
    salud:      rows.reduce((s, r) => s + r.salud,   0),
    ccf:        rows.reduce((s, r) => s + r.ccf,     0),
    arl:        rows.reduce((s, r) => s + r.arl,     0),
    grandTotal: rows.reduce((s, r) => s + r.total,   0),
  }), [rows])

  const fetchPlanilla = useCallback(async () => {
    setLoading(true)
    const res = await getPlanillaSegSocialAction(year, month)
    setExisting(res.ok ? (res.planilla ?? null) : null)
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchPlanilla() }, [fetchPlanilla])

  const handleRegistrarPago = async () => {
    if (!accountId) { setSaveError('Selecciona una cuenta bancaria'); return }
    setSaving(true)
    setSaveError('')
    const res = await registrarPagoSegSocialAction(year, month, rows, accountId, paidDate)
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error ?? 'Error al registrar el pago')
    } else {
      await fetchPlanilla()
    }
  }

  const handlePDF = async (planillaRows?: SegSocialRow[]) => {
    const data      = planillaRows ?? rows
    const tPension  = data.reduce((s, r) => s + r.pension, 0)
    const tSalud    = data.reduce((s, r) => s + r.salud,   0)
    const tCcf      = data.reduce((s, r) => s + r.ccf,     0)
    const tArl      = data.reduce((s, r) => s + r.arl,     0)
    const tGrand    = data.reduce((s, r) => s + r.total,   0)

    setPdfLoading(true)
    try {
      const jsPDF     = (await import('jspdf')).default
      const autoTable = (await import('jspdf-autotable')).default
      const doc       = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('ISADAN TRANSPORTES S.A.S', 148.5, 15, { align: 'center' })
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text('NIT: 902030120-8', 148.5, 21, { align: 'center' })
      doc.text(`Planilla de Seguridad Social — ${MESES[month - 1]} ${year}`, 148.5, 27, { align: 'center' })
      doc.setDrawColor(200); doc.line(14, 31, 283, 31)

      const tableBody: any[][] = data.map((r, i) => [
        i + 1, r.driver_name, r.document, r.days,
        COP.format(r.ibc), COP.format(r.pension), COP.format(r.salud),
        COP.format(r.ccf), COP.format(r.arl), COP.format(r.total),
      ])
      tableBody.push([
        '', 'TOTALES', '', '',
        '', COP.format(tPension), COP.format(tSalud),
        COP.format(tCcf), COP.format(tArl), COP.format(tGrand),
      ])

      autoTable(doc, {
        startY: 35,
        head: [['No.','Conductor','CC','Días','IBC','Pensión 16%','Salud 4%','CCF 4%','ARL 4.35%','Total']],
        body: tableBody,
        theme: 'grid',
        styles:       { fontSize: 8, cellPadding: 2 },
        headStyles:   { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 9,  halign: 'center' },
          3: { cellWidth: 12, halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right', fontStyle: 'bold' },
        },
        willDrawCell: (d: any) => {
          if (d.row.index === tableBody.length - 1) {
            doc.setFont('helvetica', 'bold')
          }
        },
      })

      const finalY = (doc as any).lastAutoTable?.finalY ?? 160

      doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text('Resumen por entidad', 14, finalY + 9)

      autoTable(doc, {
        startY: finalY + 13,
        head: [['Concepto', 'Entidad', 'Total']],
        body: [
          ['AFP / Pensión (16%)',  'Colpensiones / AFP',    COP.format(tPension)],
          ['EPS / Salud (4%)',     'EPS',                   COP.format(tSalud)],
          ['CCF (4%)',             'Caja Comp. Familiar',   COP.format(tCcf)],
          ['ARL (4.35%)',          'ARL Positiva',          COP.format(tArl)],
          ['TOTAL A PAGAR',        '',                      COP.format(tGrand)],
        ],
        theme: 'grid',
        tableWidth: 130,
        styles:       { fontSize: 9, cellPadding: 2 },
        headStyles:   { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right' } },
        willDrawCell: (d: any) => {
          if (d.row.index === 4) doc.setFont('helvetica', 'bold')
        },
      })

      doc.save(`planilla-seg-social-${MESES[month - 1].toLowerCase()}-${year}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  const isPaid = existingPlanilla?.paid

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-[#F8FAFC] transition-colors text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Planilla de Seguridad Social</h2>
          <p className="text-xs text-[#64748B] mt-0.5">Pensión 16% · Salud 4% · CCF 4% · ARL 4.35%</p>
        </div>
        <span className="text-[#64748B] p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors shrink-0">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Body */}
      {isOpen && (
      <div className="border-t border-[#E2E8F0]">
        {/* Period selectors */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <span className="text-xs text-[#64748B] mr-1">Período:</span>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[#0F172A] bg-white focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
          >
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[#0F172A] bg-white focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {loadingPlanilla ? (
        <div className="px-6 py-10 text-center text-sm text-[#64748B]">Cargando...</div>
      ) : drivers.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[#64748B]">No hay conductores activos.</div>
      ) : isPaid ? (
        /* ── PAID ── */
        <div className="px-4 sm:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              Pagada {existingPlanilla!.paid_date ? `• ${existingPlanilla!.paid_date}` : ''}
            </span>
            <span className="text-sm text-[#64748B]">
              Total:{' '}
              <span className="font-semibold text-[#0F172A]">
                {COP.format(existingPlanilla!.rows.reduce((s, r) => s + r.total, 0))}
              </span>
            </span>
            <button
              onClick={() => handlePDF(existingPlanilla!.rows)}
              disabled={pdfLoading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
            >
              {pdfLoading ? 'Generando...' : 'Ver planilla PDF'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  {['Conductor','Días','IBC','Pensión','Salud','CCF','ARL','Total'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#64748B] whitespace-nowrap last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {existingPlanilla!.rows.map(r => (
                  <tr key={r.driver_id} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 font-medium text-[#0F172A] whitespace-nowrap">{r.driver_name}</td>
                    <td className="px-3 py-2.5 text-center text-[#334155]">{r.days}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.ibc)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.pension)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.salud)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.ccf)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.arl)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#0F172A]">{COP.format(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── UNPAID ── */
        <div className="px-4 sm:px-6 py-4 space-y-4">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#64748B]">Conductor</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#64748B]">CC</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-[#64748B]">Días</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">IBC</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">Pensión 16%</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">Salud 4%</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">CCF 4%</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">ARL 4.35%</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#64748B]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {rows.map(r => (
                  <tr key={r.driver_id} className="hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 font-medium text-[#0F172A] whitespace-nowrap">{r.driver_name}</td>
                    <td className="px-3 py-2.5 text-[#64748B] text-xs">{r.document}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number" min={1} max={31}
                        value={daysMap[r.driver_id] ?? 30}
                        onChange={e => setDaysMap(p => ({ ...p, [r.driver_id]: Math.max(1, Math.min(31, Number(e.target.value))) }))}
                        className="w-14 text-center text-sm border border-[#E2E8F0] rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.ibc)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.pension)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.salud)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.ccf)}</td>
                    <td className="px-3 py-2.5 text-right text-[#334155]">{COP.format(r.arl)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#0F172A]">{COP.format(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F1F5F9] border-t-2 border-[#CBD5E1]">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-sm font-bold text-[#0F172A]">TOTALES</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#0F172A]">{COP.format(totals.pension)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#0F172A]">{COP.format(totals.salud)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#0F172A]">{COP.format(totals.ccf)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#0F172A]">{COP.format(totals.arl)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#0F172A]">{COP.format(totals.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {rows.map(r => (
              <div key={r.driver_id} className="rounded-lg border border-[#E2E8F0] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[#0F172A]">{r.driver_name}</p>
                  <p className="text-xs text-[#94A3B8]">{r.document}</p>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[#64748B]">Días:</span>
                  <input
                    type="number" min={1} max={31}
                    value={daysMap[r.driver_id] ?? 30}
                    onChange={e => setDaysMap(p => ({ ...p, [r.driver_id]: Math.max(1, Math.min(31, Number(e.target.value))) }))}
                    className="w-14 text-center text-sm border border-[#E2E8F0] rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  {([['IBC', r.ibc], ['Pensión', r.pension], ['Salud', r.salud], ['CCF', r.ccf], ['ARL', r.arl]] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="flex justify-between col-span-1 pr-2">
                      <span className="text-[#64748B]">{label}</span>
                      <span className="text-[#334155]">{COP.format(val)}</span>
                    </div>
                  ))}
                  <div className="col-span-2 flex justify-between border-t border-[#E2E8F0] pt-1.5 mt-1">
                    <span className="font-semibold text-[#0F172A]">Total</span>
                    <span className="font-semibold text-[#0F172A]">{COP.format(r.total)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-lg bg-[#F1F5F9] p-4 flex justify-between items-center">
              <span className="font-bold text-[#0F172A]">Total a pagar</span>
              <span className="font-bold text-lg text-[#0F172A]">{COP.format(totals.grandTotal)}</span>
            </div>
          </div>

          {/* Payment form */}
          <div className="border-t border-[#E2E8F0] pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              {bankAccounts.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#64748B]">Cuenta bancaria</label>
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                  >
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#64748B]">Fecha de pago</label>
                <input
                  type="date" value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                  className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                />
              </div>
              <div className="flex items-end gap-2 ml-auto">
                <button
                  onClick={() => handlePDF()}
                  disabled={pdfLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? 'Generando...' : 'Descargar planilla'}
                </button>
                <button
                  onClick={handleRegistrarPago}
                  disabled={saving || !accountId}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-[#1E293B] text-white hover:bg-[#0F172A] transition-colors disabled:opacity-60"
                >
                  {saving
                    ? 'Registrando...'
                    : `Registrar pago · ${COP.format(totals.grandTotal)}`}
                </button>
              </div>
            </div>
            {saveError && (
              <p className="mt-2 text-xs text-red-600">{saveError}</p>
            )}
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  )
}
