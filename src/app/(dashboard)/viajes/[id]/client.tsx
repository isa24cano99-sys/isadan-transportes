'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, FilePlus, CheckCircle, ExternalLink, RefreshCw, Pencil, ScrollText, Trash2, ReceiptText, Loader2, AlertTriangle } from 'lucide-react'
import { cambiarEstadoAction, generarFacturaAction, registrarFacturaManualAction, asignarVehiculoAction, asignarConductorAction, eliminarViajeAction, marcarFacturaAnuladaManualAction } from './actions'
import type { TripDetail } from './actions'
import { formatCOP, formatDate, formatInvoiceNumber } from '@/lib/utils'

const STATUS_FLOW = [
  { key: 'PLANEADO',   label: 'Planeado',   cls: 'bg-gray-100 text-gray-600 border-gray-300' },
  { key: 'EN_CURSO',   label: 'En curso',   cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'FINALIZADO', label: 'Finalizado', cls: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'PAGADO',     label: 'Pagado',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-[#0F172A]">{children}</div>
    </div>
  )
}

type VehicleOption = { id: string; plate: string; brand: string; model: string }
type DriverOption  = { id: string; full_name: string }

export default function ViajeDetailClient({
  trip: initial,
  invoiceNumber: initialInvNum,
  pdfUrl: initialPdf,
  creditNoteId: initialCreditNoteId,
  creditNoteNumber: initialCreditNoteNumber,
  manifestPdfUrl,
  fleteWarning,
  allVehicles,
  allDrivers,
}: {
  trip: TripDetail
  invoiceNumber: string | null
  pdfUrl: string | null
  creditNoteId: string | null
  creditNoteNumber: string | null
  manifestPdfUrl: string | null
  fleteWarning: { legFreight: number; manifestFreight: number } | null
  allVehicles: VehicleOption[]
  allDrivers: DriverOption[]
}) {
  const [trip, setTrip] = useState(initial)
  const router = useRouter()
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [changingStatus,   setChangingStatus]   = useState(false)
  const [assigningVehicle, setAssigningVehicle] = useState(false)
  const [assigningDriver,  setAssigningDriver]  = useState(false)
  const [selectedVehicle,  setSelectedVehicle]  = useState('')
  const [selectedDriver,   setSelectedDriver]   = useState('')
  const [savingVehicle,    setSavingVehicle]    = useState(false)
  const [savingDriver,     setSavingDriver]     = useState(false)
  const [invoicing,      setInvoicing]      = useState(false)
  const [invoiceResult,  setInvoiceResult]  = useState<{ number: string; pdfUrl: string } | null>(
    initialInvNum ? { number: initialInvNum, pdfUrl: initialPdf ?? '' } : null,
  )
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  // Anulada manualmente en Dataico → credit_note_id === 'MANUAL'
  const [anuladaManual, setAnuladaManual] = useState(initialCreditNoteId === 'MANUAL')
  // Nota crédito real generada por la app (Dataico) — se conserva para datos previos
  const [ncResult] = useState<{ uuid: string; number: string } | null>(
    initialCreditNoteId && initialCreditNoteId !== 'MANUAL'
      ? { uuid: initialCreditNoteId, number: initialCreditNoteNumber ?? '' }
      : null,
  )
  const [showAnularModal, setShowAnularModal] = useState(false)
  const [anulando,        setAnulando]        = useState(false)
  // Facturación manual (viaje ya facturado por fuera de la app)
  const [showManualModal, setShowManualModal] = useState(false)
  const [savingManual,    setSavingManual]    = useState(false)
  const [manualError,     setManualError]     = useState<string | null>(null)
  const [reactivableMsg,  setReactivableMsg]  = useState<string | null>(null)
  const [vinculableMsg,   setVinculableMsg]   = useState<string | null>(null)
  const [manualFolio,     setManualFolio]     = useState('')
  // Monto prellenado: flete de la legalización aprobada si difiere del manifiesto, si no el del viaje
  const [manualMonto,     setManualMonto]     = useState(String(fleteWarning?.legFreight ?? initial.freight_value ?? ''))
  const [manualFecha,     setManualFecha]     = useState(new Date().toISOString().slice(0, 10))

  const currentStatus   = STATUS_FLOW.find(s => s.key === trip.status)
  const canInvoice      = ['FINALIZADO', 'FACTURADO'].includes(trip.status)
  const alreadyInvoiced = !!trip.dataico_invoice_id || !!invoiceResult
  const hasCreditNote   = !!ncResult

  const facturaNumero = invoiceResult?.number ?? initialInvNum ?? trip.dataico_invoice_id ?? ''

  const handleMarcarAnulada = async () => {
    setAnulando(true)
    const res = await marcarFacturaAnuladaManualAction(trip.id)
    setAnulando(false)
    if (res.ok) {
      setAnuladaManual(true)
      setInvoiceResult(null)
      setInvoiceError(null)
      setTrip(prev => ({ ...prev, status: 'FINALIZADO', dataico_invoice_id: null }))
      setShowAnularModal(false)
    } else {
      setInvoiceError(res.error ?? 'No se pudo anular')
      setShowAnularModal(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (changingStatus || newStatus === trip.status) return
    setChangingStatus(true)
    const res = await cambiarEstadoAction(trip.id, newStatus)
    if (res.ok) setTrip(prev => ({ ...prev, status: newStatus }))
    setChangingStatus(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const res = await eliminarViajeAction(trip.id)
    if (res.ok) router.push('/viajes')
    else setDeleting(false)
  }

  const handleAsignarVehiculo = async () => {
    if (!selectedVehicle) return
    setSavingVehicle(true)
    const res = await asignarVehiculoAction(trip.id, selectedVehicle)
    if (res.ok) {
      setTrip(prev => ({ ...prev, vehicles: res.vehicle }))
      setAssigningVehicle(false)
      setSelectedVehicle('')
    }
    setSavingVehicle(false)
  }

  const handleAsignarConductor = async () => {
    if (!selectedDriver) return
    setSavingDriver(true)
    const res = await asignarConductorAction(trip.id, selectedDriver)
    if (res.ok) {
      setTrip(prev => ({ ...prev, drivers: res.driver }))
      setAssigningDriver(false)
      setSelectedDriver('')
    }
    setSavingDriver(false)
  }

  const handleGenerarFactura = async () => {
    setInvoicing(true)
    setInvoiceError(null)
    const res = await generarFacturaAction(trip.id)
    if (res.ok) {
      setInvoiceResult({ number: res.invoiceNumber, pdfUrl: res.pdfUrl })
      setTrip(prev => ({ ...prev, status: 'FACTURADO' }))
      if (res.warning) setInvoiceError(res.warning)   // aviso suave: se emitió, pero el tercero está incompleto
    } else {
      setInvoiceError(res.error)
    }
    setInvoicing(false)
  }

  const aplicarFacturaManualOk = (invoiceNumber: string) => {
    setInvoiceResult({ number: invoiceNumber, pdfUrl: '' })
    setInvoiceError(null)
    setTrip(prev => ({ ...prev, status: 'FACTURADO', dataico_invoice_id: invoiceNumber }))
    setShowManualModal(false)
    setReactivableMsg(null)
    setVinculableMsg(null)
    setManualError(null)
  }

  const handleRegistrarManual = async (mode: 'submit' | 'reactivate' | 'vincular' = 'submit') => {
    setSavingManual(true)
    setManualError(null)
    if (mode === 'submit') { setReactivableMsg(null); setVinculableMsg(null) }
    const res = await registrarFacturaManualAction({
      tripId: trip.id,
      invoiceNumber: manualFolio,
      totalAmount: Number(manualMonto),
      date: manualFecha,
      confirmReactivate: mode === 'reactivate',
      confirmVincular: mode === 'vincular',
    })
    setSavingManual(false)
    if (res.status === 'ok') aplicarFacturaManualOk(res.invoiceNumber)
    else if (res.status === 'reactivable') setReactivableMsg(res.message)
    else if (res.status === 'vinculable') setVinculableMsg(res.message)
    else { setManualError(res.message); setReactivableMsg(null); setVinculableMsg(null) }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      {/* Advertencia: flete de legalización distinto al manifiesto */}
      {fleteWarning && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            El flete de la legalización (<span className="font-semibold">{formatCOP(fleteWarning.legFreight)}</span>) difiere
            del manifiesto (<span className="font-semibold">{formatCOP(fleteWarning.manifestFreight)}</span>).
            La factura se generará por <span className="font-semibold">{formatCOP(fleteWarning.legFreight)}</span>.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5 md:mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/viajes"
            className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <ArrowLeft size={14} /> Viajes
          </Link>
          <span className="text-[#CBD5E1]">/</span>
          <h1 className="text-base font-semibold text-[#0F172A]">{trip.trip_number}</h1>
          {trip.manifest_number && (
            <span className="text-xs text-[#94A3B8]">· MF {trip.manifest_number}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentStatus && (
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${currentStatus.cls}`}>
              {currentStatus.label}
            </span>
          )}
          {trip.status === 'FINALIZADO' && !alreadyInvoiced && (
            <>
              <button
                onClick={handleGenerarFactura}
                disabled={invoicing}
                className="flex items-center gap-1.5 text-xs text-white font-semibold px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors"
              >
                {invoicing
                  ? <><RefreshCw size={11} className="animate-spin" /> Generando factura...</>
                  : <><FileText size={11} /> Generar factura DIAN</>}
              </button>
              <button
                onClick={() => setShowManualModal(true)}
                disabled={invoicing}
                className="flex items-center gap-1.5 text-xs text-[#2563EB] font-medium px-3 py-1.5 border border-[#2563EB]/30 hover:bg-blue-50 disabled:opacity-50 rounded-lg transition-colors"
              >
                <FilePlus size={11} /> Ya facturé (manual)
              </button>
            </>
          )}
          {alreadyInvoiced && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200">
              <CheckCircle size={11} />
              {invoiceResult?.number ? formatInvoiceNumber(invoiceResult.number) : (trip.dataico_invoice_id?.slice(0, 8) ?? 'Facturado')}
              {invoiceResult?.pdfUrl && (
                <a href={invoiceResult.pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-green-600 hover:text-green-800">
                  <ExternalLink size={10} />
                </a>
              )}
            </span>
          )}
          {alreadyInvoiced && !hasCreditNote && !anuladaManual && (
            <button
              onClick={() => setShowAnularModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
            >
              <ReceiptText size={11} />
              Marcar como anulada
            </button>
          )}
          {anuladaManual && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200">
              <ReceiptText size={11} />
              Anulada manualmente
            </span>
          )}
          {hasCreditNote && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">
              <ReceiptText size={11} />
              NC {ncResult?.number || 'generada'}
            </span>
          )}
          {invoiceError && (
            <span className="text-xs text-red-500 font-medium">{invoiceError}</span>
          )}
          <Link
            href={`/viajes/${trip.id}/editar`}
            className="flex items-center gap-1.5 text-xs text-[#2563EB] font-medium px-3 py-1.5 border border-[#E2E8F0] rounded-lg hover:border-[#2563EB]/40 transition-colors"
          >
            <Pencil size={11} /> Editar
          </Link>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-red-500 font-medium px-3 py-1.5 border border-[#E2E8F0] rounded-lg hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={11} /> Eliminar
          </button>
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Ruta */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#64748B]">Ruta</p>
          <Field label="Origen">
            <span className="font-medium">{trip.origin}</span>
          </Field>
          <Field label="Destino">
            <span className="font-medium">{trip.destination}</span>
          </Field>
          <Field label="Fecha de expedición">{formatDate(trip.load_date)}</Field>
        </div>

        {/* Cliente */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#64748B]">Cliente</p>
          <Field label="Razón social">
            <span className="font-medium">{trip.clients?.name ?? '—'}</span>
          </Field>
          {trip.clients?.nit   && <Field label="NIT">{trip.clients.nit}</Field>}
          {trip.clients?.email && <Field label="Email">{trip.clients.email}</Field>}
        </div>

        {/* Vehículo y conductor */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#64748B]">Operación</p>
          <Field label="Placa">
            {trip.vehicles ? (
              <>
                <span className="font-mono font-bold">{trip.vehicles.plate}</span>
                <span className="text-[#64748B] ml-1">— {trip.vehicles.brand} {trip.vehicles.model}</span>
              </>
            ) : assigningVehicle ? (
              <div className="flex gap-2 mt-1">
                <select
                  value={selectedVehicle}
                  onChange={e => setSelectedVehicle(e.target.value)}
                  className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {allVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plate}</option>
                  ))}
                </select>
                <button
                  onClick={handleAsignarVehiculo}
                  disabled={!selectedVehicle || savingVehicle}
                  className="text-xs font-semibold text-white bg-[#2563EB] px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {savingVehicle ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setAssigningVehicle(false)} className="text-xs text-[#64748B] px-1 hover:text-[#0F172A]">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[#94A3B8]">—</span>
                <button onClick={() => setAssigningVehicle(true)} className="text-xs font-medium text-[#2563EB] hover:underline">
                  Asignar
                </button>
              </div>
            )}
          </Field>
          <Field label="Conductor">
            {trip.drivers ? (
              trip.drivers.full_name
            ) : assigningDriver ? (
              <div className="flex gap-2 mt-1">
                <select
                  value={selectedDriver}
                  onChange={e => setSelectedDriver(e.target.value)}
                  className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {allDrivers.map(d => (
                    <option key={d.id} value={d.id}>{d.full_name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAsignarConductor}
                  disabled={!selectedDriver || savingDriver}
                  className="text-xs font-semibold text-white bg-[#2563EB] px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {savingDriver ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setAssigningDriver(false)} className="text-xs text-[#64748B] px-1 hover:text-[#0F172A]">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[#94A3B8]">—</span>
                <button onClick={() => setAssigningDriver(true)} className="text-xs font-medium text-[#2563EB] hover:underline">
                  Asignar
                </button>
              </div>
            )}
          </Field>
        </div>

        {/* Flete */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#64748B]">Financiero</p>
          <Field label="Valor del flete">
            <span className="text-xl font-bold text-[#0F172A]">{formatCOP(trip.freight_value)}</span>
          </Field>
          {fleteWarning && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Se facturará por</p>
                <p className="text-sm font-bold text-amber-800 tabular-nums">{formatCOP(fleteWarning.legFreight)}</p>
              </div>
              <span className="text-[10px] text-amber-600 text-right leading-tight">viene de la<br />legalización</span>
            </div>
          )}
          {trip.advance_amount > 0 && (
            <Field label="Anticipo">{formatCOP(trip.advance_amount)}</Field>
          )}
          {trip.weight_kg != null && (
            <Field label="Peso / Precio por ton">
              {trip.weight_kg.toLocaleString('es-CO')} kg
              {trip.price_per_ton != null && (
                <span className="text-[#64748B]"> · {formatCOP(trip.price_per_ton)}/ton</span>
              )}
            </Field>
          )}
          {trip.load_content && (
            <Field label="Mercancía">{trip.load_content}</Field>
          )}
        </div>

        {/* Notas */}
        {trip.notes && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 md:col-span-2">
            <p className="text-xs font-semibold text-[#64748B] mb-2">Notas</p>
            <p className="text-sm text-[#64748B] whitespace-pre-line">{trip.notes}</p>
          </div>
        )}
      </div>

      {/* Manifest section */}
      {(trip.manifest_auth || trip.manifest_number) && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ScrollText size={14} className="text-[#64748B]" />
              <p className="text-xs font-semibold text-[#64748B]">Manifiesto electrónico</p>
            </div>
            {manifestPdfUrl && (
              <a
                href={manifestPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:underline bg-blue-50 px-3 py-1.5 rounded-lg"
              >
                <ExternalLink size={11} /> Ver PDF
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {trip.manifest_auth && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Autorización</p>
                <p className="text-sm font-mono font-bold text-[#0F172A] mt-0.5">{trip.manifest_auth}</p>
              </div>
            )}
            {trip.manifest_number && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">N° Manifiesto</p>
                <p className="text-sm font-mono text-[#0F172A] mt-0.5">{trip.manifest_number}</p>
              </div>
            )}
            {trip.origin && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Origen</p>
                <p className="text-sm text-[#0F172A] mt-0.5">{trip.origin}</p>
              </div>
            )}
            {trip.destination && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Destino</p>
                <p className="text-sm text-[#0F172A] mt-0.5">{trip.destination}</p>
              </div>
            )}
            {trip.load_content && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Mercancía</p>
                <p className="text-sm text-[#0F172A] mt-0.5">{trip.load_content}</p>
              </div>
            )}
            {trip.weight_kg != null && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Peso</p>
                <p className="text-sm text-[#0F172A] mt-0.5">{trip.weight_kg.toLocaleString('es-CO')} kg</p>
              </div>
            )}
            {trip.freight_value != null && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Flete</p>
                <p className="text-sm font-semibold text-[#0F172A] mt-0.5">{formatCOP(trip.freight_value)}</p>
              </div>
            )}
            {trip.advance_amount > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Anticipo</p>
                <p className="text-sm text-[#0F172A] mt-0.5">{formatCOP(trip.advance_amount)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status change */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-[#64748B] mb-3">Cambiar estado</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_FLOW.map(s => (
            <button
              key={s.key}
              onClick={() => handleStatusChange(s.key)}
              disabled={changingStatus}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${
                trip.status === s.key
                  ? `${s.cls} ring-2 ring-offset-1 ring-current`
                  : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB]/40 hover:text-[#2563EB]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice section */}
      {canInvoice && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#64748B] mb-3">Factura electrónica DIAN</p>

          {alreadyInvoiced || invoiceResult ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-700">
                  {invoiceResult ? `✅ Factura ${formatInvoiceNumber(invoiceResult.number)} generada` : '✅ Factura generada'}
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Factura electrónica emitida y validada por la DIAN
                </p>
              </div>
              {invoiceResult?.pdfUrl && (
                <a
                  href={invoiceResult.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  <ExternalLink size={12} /> Ver PDF
                </a>
              )}
            </div>
          ) : (
            <div>
              {invoiceError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-3">
                  {invoiceError}
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleGenerarFactura}
                  disabled={invoicing}
                  className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  {invoicing
                    ? <><RefreshCw size={14} className="animate-spin" /> Generando factura…</>
                    : <><FileText size={14} /> Generar factura DIAN</>
                  }
                </button>
                <button
                  onClick={() => setShowManualModal(true)}
                  disabled={invoicing}
                  className="flex items-center gap-2 text-[#2563EB] text-sm font-medium px-5 py-2.5 border border-[#2563EB]/30 hover:bg-blue-50 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <FilePlus size={14} /> Ya facturé (manual)
                </button>
                <p className="text-xs text-[#94A3B8]">
                  Se facturará {formatCOP(trip.freight_value)} a{' '}
                  {trip.clients?.name ?? 'el cliente'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Marcar como facturada manualmente */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !savingManual && setShowManualModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="font-semibold text-[#0F172A]">Marcar como facturada manualmente</h2>
              <p className="text-sm text-[#64748B] mt-1">
                El viaje ya tiene factura hecha por fuera de la app. Registra el folio para que el sistema
                la reconozca y la cruce con la DIAN.
              </p>
            </div>
            {manualError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{manualError}</div>
            )}
            {reactivableMsg && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">{reactivableMsg}</div>
            )}
            {vinculableMsg && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-3 py-2 rounded-lg">{vinculableMsg}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">N° de factura (folio)</label>
                <input
                  value={manualFolio}
                  onChange={e => { setManualFolio(e.target.value); setReactivableMsg(null); setVinculableMsg(null); setManualError(null) }}
                  placeholder="FEIT25"
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Monto facturado</label>
                <input
                  type="number"
                  value={manualMonto}
                  onChange={e => setManualMonto(e.target.value)}
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {fleteWarning ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Prellenado con el flete de la legalización aprobada ({formatCOP(fleteWarning.legFreight)}),
                    distinto del manifiesto ({formatCOP(fleteWarning.manifestFreight)}). Ajústalo si la factura difiere.
                  </p>
                ) : (
                  <p className="text-[11px] text-[#94A3B8] mt-1">Prellenado con el flete del viaje. Ajústalo si la factura difiere.</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Fecha de la factura</label>
                <input
                  type="date"
                  value={manualFecha}
                  onChange={e => setManualFecha(e.target.value)}
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowManualModal(false); setReactivableMsg(null); setVinculableMsg(null); setManualError(null) }}
                disabled={savingManual}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              {reactivableMsg ? (
                <button
                  onClick={() => handleRegistrarManual('reactivate')}
                  disabled={savingManual}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingManual ? <><Loader2 size={13} className="animate-spin" /> Reactivando…</> : 'Reactivar y vincular'}
                </button>
              ) : vinculableMsg ? (
                <button
                  onClick={() => handleRegistrarManual('vincular')}
                  disabled={savingManual}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingManual ? <><Loader2 size={13} className="animate-spin" /> Vinculando…</> : 'Vincular a este viaje'}
                </button>
              ) : (
                <button
                  onClick={() => handleRegistrarManual('submit')}
                  disabled={savingManual || !manualFolio.trim() || !(Number(manualMonto) > 0)}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingManual ? <><Loader2 size={13} className="animate-spin" /> Registrando…</> : 'Confirmar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmar anulación manual */}
      {showAnularModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !anulando && setShowAnularModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-[#0F172A]">Marcar factura como anulada</h2>
            <p className="text-sm text-[#64748B]">
              ¿Confirmar que esta factura fue anulada manualmente en Dataico? Número:{' '}
              <span className="font-mono font-semibold text-[#0F172A]">{formatInvoiceNumber(facturaNumero)}</span>
            </p>
            <p className="text-xs text-[#94A3B8]">
              Quedará excluida de los ingresos y el viaje volverá a <span className="font-medium">Finalizado</span> para poder refacturar si lo necesitas.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAnularModal(false)}
                disabled={anulando}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarcarAnulada}
                disabled={anulando}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {anulando ? <><Loader2 size={13} className="animate-spin" /> Anulando…</> : 'Sí, marcar anulada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar viaje</h2>
            <p className="text-sm text-[#64748B]">
              Se eliminara el viaje <span className="font-medium text-[#0F172A]">{trip.trip_number}</span> y su legalizacion asociada de forma permanente. Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar viaje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hint when not yet finalizado */}
      {!canInvoice && (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3">
          <p className="text-xs text-[#94A3B8]">
            Cambia el estado a <span className="font-semibold text-[#64748B]">Finalizado</span> para habilitar la generación de factura electrónica.
          </p>
        </div>
      )}
    </div>
  )
}
