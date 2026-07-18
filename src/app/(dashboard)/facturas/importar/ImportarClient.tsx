'use client'

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { formatCOP, formatTripOption, tripMatchesQuery } from '@/lib/utils'
import {
  importarDianAction, cruzarCufeAction,
  getTollsAction, getResultadosAction, asociarViajeAction,
  type DianRow, type ImportResult, type TollWithMatch, type DianInv,
} from './actions'
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react'

import type { Trip } from '@/lib/types'
type CrossStats = { matched: number; dianTotal: number; otrosGastos: DianInv[] }

// ── Excel parsing helpers ──────────────────────────────────────────────────────

function norm(s: string) { return s.trim().normalize('NFC') }

function getCol(row: Record<string, unknown>, ...names: string[]): string {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v !== undefined && v !== null && v !== '') return String(v).trim()
  }
  return ''
}

function getNum(row: Record<string, unknown>, ...names: string[]): number {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') return isNaN(v) ? 0 : v
    const parsed = parseFloat(String(v).trim().replace(/[$\s.]/g, '').replace(',', '.'))
    if (!isNaN(parsed)) return parsed
  }
  return 0
}

function parseDianDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0]
  const s = String(val).trim()
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return s || null
}

function mapDian(raw: Record<string, unknown>): DianRow {
  return {
    document_type:  getCol(raw, 'Tipo de documento', 'Tipo de Documento'),
    cufe:           getCol(raw, 'CUFE/CUDE', 'CUFE', 'CUDE'),
    folio:          getCol(raw, 'Folio'),
    prefix:         getCol(raw, 'Prefijo'),
    issue_date:     parseDianDate(raw['Fecha Emisión'] ?? raw['Fecha Emision'] ?? raw['Fecha de Emisión']),
    reception_date: parseDianDate(raw['Fecha Recepción'] ?? raw['Fecha Recepcion']),
    nit_issuer:     getCol(raw, 'NIT Emisor'),
    name_issuer:    getCol(raw, 'Nombre Emisor'),
    nit_receiver:   getCol(raw, 'NIT Receptor'),
    name_receiver:  getCol(raw, 'Nombre Receptor'),
    iva:            getNum(raw, 'IVA', 'Iva'),
    total:          getNum(raw, 'Total'),
    status:         getCol(raw, 'Estado'),
  }
}

async function parseXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()
  const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  try {
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(s))
  } catch { return s }
}

function fmtDateOnly(s: string | null) {
  if (!s) return '—'
  try {
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(s))
  } catch { return s }
}

function truncCufe(cufe: string | null): string {
  if (!cufe) return '—'
  return cufe.length > 15 ? cufe.slice(0, 15) + '…' : cufe
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ImportarClient({ trips }: { trips: Trip[] }) {
  // DIAN upload
  const [dianRows,    setDianRows]    = useState<DianRow[]>([])
  const [dianFileName,setDianFileName]= useState('')
  const [loadingDian, setLoadingDian] = useState(false)
  const [dianResult,  setDianResult]  = useState<ImportResult | null>(null)

  // Peajes table (cargados desde la BD; el upload de Flypass vive en /facturas)
  const [tolls,       setTolls]       = useState<TollWithMatch[]>([])
  const [loadingTolls,setLoadingTolls]= useState(false)

  // Cross-match
  const [crossing,    setCrossing]    = useState(false)
  const [crossErr,    setCrossErr]    = useState('')
  const [crossStats,  setCrossStats]  = useState<CrossStats | null>(null)

  // Trip assignment
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [savingTrip,  setSavingTrip]  = useState<string | null>(null)
  const [tripSearch,  setTripSearch]  = useState('')

  // Filtro de período de la tabla de peajes
  const [fpMonthFilter, setFpMonthFilter] = useState('')
  const [fpYearFilter,  setFpYearFilter]  = useState('')

  const dianOk = dianResult?.ok === true

  // Cargar peajes existentes al entrar (ya no dependemos del upload de Flypass).
  useEffect(() => { loadTolls() }, [])

  // Cruce automático tras importar DIAN.
  useEffect(() => {
    if (dianOk && !crossing && !crossStats) { runCross() }
  }, [dianOk])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTolls() {
    setLoadingTolls(true)
    const data = await getTollsAction()
    const init: Record<string, string> = {}
    for (const t of data) { if (t.trip_id) init[t.id] = t.trip_id }
    setAssignments(prev => ({ ...init, ...prev }))
    setTolls(data)
    setLoadingTolls(false)
  }

  async function runCross() {
    setCrossing(true)
    setCrossErr('')
    const cross = await cruzarCufeAction()
    if (!cross.ok) { setCrossErr(cross.error); setCrossing(false); return }
    const [stats, refreshedTolls] = await Promise.all([getResultadosAction(), getTollsAction()])
    setCrossStats({ matched: stats.matched, dianTotal: stats.dianTotal, otrosGastos: stats.otrosGastos })
    const init: Record<string, string> = {}
    for (const t of refreshedTolls) { if (t.trip_id) init[t.id] = t.trip_id }
    setAssignments(prev => ({ ...init, ...prev }))
    setTolls(refreshedTolls)
    setCrossing(false)
  }

  const handleDianFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setDianFileName(file.name); setDianResult(null)
    setDianRows((await parseXlsx(file)).map(mapDian))
  }

  const importDian = async () => {
    setLoadingDian(true)
    setDianResult(await importarDianAction(dianRows))
    setLoadingDian(false)
  }

  const handleTripChange = async (tollId: string, tripId: string) => {
    setAssignments(a => ({ ...a, [tollId]: tripId }))
    setSavingTrip(tollId)
    await asociarViajeAction(tollId, tripId || null)
    setSavingTrip(null)
  }

  const filteredTolls = useMemo(() => {
    return tolls.filter(t => {
      if (!t.pass_date) return true
      const d = new Date(t.pass_date)
      if (fpMonthFilter && d.getMonth() + 1 !== parseInt(fpMonthFilter, 10)) return false
      if (fpYearFilter  && d.getFullYear()   !== parseInt(fpYearFilter,  10)) return false
      return true
    })
  }, [tolls, fpMonthFilter, fpYearFilter])

  const sinFactura = filteredTolls.filter(t => !t.tiene_factura)

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Cruce DIAN / CUFE</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Carga el reporte DIAN y crúzalo por CUFE contra los peajes ya importados.
          </p>
        </div>
        <button
          onClick={runCross}
          disabled={crossing}
          className="inline-flex items-center gap-1.5 bg-white border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-[#F8FAFC] disabled:opacity-50 text-[#0F172A] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
        >
          <RefreshCw size={14} className={crossing ? 'animate-spin' : ''} />
          {crossing ? 'Cruzando…' : 'Cruzar CUFEs'}
        </button>
      </div>

      {/* ── Upload card DIAN ── */}
      <div className="mb-6 max-w-xl">
        <UploadCard
          label="DIAN" title="Reporte DIAN"
          description="Archivo .xlsx con facturas electrónicas recibidas en la bandeja DIAN."
          fileName={dianFileName} rowCount={dianRows.length}
          loading={loadingDian} result={dianResult}
          onFile={handleDianFile} onImport={importDian}
          buttonLabel="Importar facturas DIAN"
        />
      </div>

      {/* ── Cross-match loader ── */}
      {crossing && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center mb-6">
          <RefreshCw size={28} className="animate-spin text-[#2563EB] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0F172A]">Cruzando CUFEs con facturas DIAN…</p>
          <p className="text-xs text-[#94A3B8] mt-1">Esto puede tomar unos segundos.</p>
        </div>
      )}
      {crossErr && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-6">
          <p className="text-sm text-red-700">Error al cruzar CUFEs: {crossErr}</p>
        </div>
      )}

      {/* ── Stats (only after cross-match) ── */}
      {crossStats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Peajes en BD"           value={tolls.length}         color="blue"   />
            <StatCard label="Facturas DIAN en BD"    value={crossStats.dianTotal}  color="blue"   />
            <StatCard label="Cruzados exitosamente"  value={crossStats.matched}    color="green"  />
            <StatCard label="Sin factura DIAN"       value={sinFactura.length}
              color={sinFactura.length > 0 ? 'yellow' : 'green'} />
          </div>

          {sinFactura.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-6 flex items-start gap-3">
              <AlertTriangle size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  {sinFactura.length} peaje(s) sin factura electrónica en el reporte DIAN
                </p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  Estos cobros no tienen una factura electrónica registrada. Verifica si están pendientes
                  de emisión o exentos de facturación.
                </p>
              </div>
            </div>
          )}

          {crossStats.otrosGastos.length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl mb-6 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0]">
                <h3 className="font-semibold text-[#0F172A] text-sm">Facturas DIAN — otros proveedores</h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  {crossStats.otrosGastos.length} factura(s) que no corresponden a peajes Flypass
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                      {['NIT Emisor','Nombre Emisor','Folio','Fecha emisión','IVA','Total'].map(h => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#64748B] ${h==='IVA'||h==='Total'?'text-right':'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {crossStats.otrosGastos.map(inv => (
                      <tr key={inv.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-2.5 text-sm font-mono text-[#64748B]">{inv.nit_issuer || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-[#0F172A]">{inv.name_issuer || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-[#64748B]">{inv.folio || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-[#64748B]">{fmtDateOnly(inv.issue_date)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-[#64748B]">{formatCOP(inv.iva)}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-right">{formatCOP(inv.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Peajes table (shown right after FP import) ── */}
      {(loadingTolls || tolls.length > 0) && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-[#0F172A] text-sm">
                  Transacciones Flypass
                  {tolls.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-[#94A3B8]">
                      ({filteredTolls.length}{filteredTolls.length !== tolls.length ? ` de ${tolls.length}` : ''} registros)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Ordenadas por fecha descendente · Asigna cada peaje al viaje correspondiente.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={tripSearch}
                  onChange={e => setTripSearch(e.target.value)}
                  placeholder="Buscar viaje (manifiesto, placa, ruta)…"
                  className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[#0F172A] w-56"
                />
                <select value={fpMonthFilter} onChange={e => setFpMonthFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[#64748B]">
                  <option value="">Todos los meses</option>
                  {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                    <option key={i+1} value={String(i+1)}>{m}</option>
                  ))}
                </select>
                <select value={fpYearFilter} onChange={e => setFpYearFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[#64748B]">
                  <option value="">Todos los años</option>
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
                {loadingTolls && <RefreshCw size={14} className="animate-spin text-[#94A3B8]" />}
              </div>
            </div>
          </div>

          {loadingTolls && tolls.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#94A3B8]">Cargando registros…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Placa</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Peaje</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Categoría</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Fecha del paso</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B]">Total</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">CUFE</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Factura DIAN</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] min-w-[200px]">Viaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredTolls.map(t => (
                    <tr
                      key={t.id}
                      className={`hover:bg-[#F8FAFC] transition-colors ${!t.tiene_factura ? 'bg-yellow-50/40' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-mono font-bold text-[#0F172A]">{t.plate || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[#0F172A]">{t.toll_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-[#64748B]">{t.category || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-[#64748B] whitespace-nowrap">
                        {fmtDateTime(t.pass_date)}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-right text-[#0F172A]">
                        {formatCOP(t.total)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="text-xs font-mono text-[#64748B]"
                          title={t.cufe ?? undefined}
                        >
                          {truncCufe(t.cufe)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.tiene_factura ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <CheckCircle size={10} /> Sí
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={10} /> No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={assignments[t.id] ?? ''}
                          onChange={e => handleTripChange(t.id, e.target.value)}
                          disabled={savingTrip === t.id}
                          className="w-full text-xs border border-[#E2E8F0] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="">— Sin asignar —</option>
                          {trips
                            .filter(trip => trip.id === assignments[t.id] || tripMatchesQuery(trip, tripSearch))
                            .map(trip => (
                              <option key={trip.id} value={trip.id}>{formatTripOption(trip)}</option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function UploadCard({
  label, title, description, fileName, rowCount,
  loading, result, onFile, onImport, buttonLabel,
}: {
  label: string; title: string; description: string; fileName: string; rowCount: number
  loading: boolean; result: ImportResult | null
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onImport: () => void; buttonLabel: string
}) {
  const done = result?.ok === true
  const res  = result as { ok: true; inserted: number; duplicates: number } | null
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-white bg-[#2563EB] px-2 py-0.5 rounded">{label}</span>
        <h2 className="font-semibold text-[#0F172A] text-sm">{title}</h2>
      </div>
      <p className="text-xs text-[#94A3B8] mb-4">{description}</p>

      <label className="block mb-3 cursor-pointer">
        <div className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
          fileName ? 'border-[#2563EB] bg-blue-50/40' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
        }`}>
          <FileSpreadsheet size={22} className={`mx-auto mb-1.5 ${fileName ? 'text-[#2563EB]' : 'text-[#CBD5E1]'}`} />
          <p className="text-xs text-[#64748B] truncate max-w-[200px] mx-auto">
            {fileName || 'Haz clic o arrastra el archivo'}
          </p>
          {rowCount > 0 && (
            <p className="text-xs font-semibold text-[#2563EB] mt-1">{rowCount} filas leídas</p>
          )}
        </div>
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
      </label>

      {result?.ok === false && (
        <p className="text-xs text-red-600 mb-2 bg-red-50 rounded-lg px-3 py-2">Error: {result.error}</p>
      )}
      {done && res && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
          <CheckCircle size={13} />
          <span>
            {res.inserted} importados
            {res.duplicates > 0 ? ` · ${res.duplicates} duplicados omitidos` : ''}
          </span>
        </div>
      )}

      <button
        onClick={onImport}
        disabled={!rowCount || loading || done}
        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading
          ? <><RefreshCw size={13} className="animate-spin" /> Importando…</>
          : done
            ? <><CheckCircle size={13} /> Importado</>
            : <><Upload size={13} /> {buttonLabel}</>
        }
      </button>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'green' | 'yellow' }) {
  const cls = { blue: 'text-[#2563EB]', green: 'text-green-700', yellow: 'text-yellow-700' }[color]
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${cls}`}>{value.toLocaleString('es-CO')}</p>
    </div>
  )
}
