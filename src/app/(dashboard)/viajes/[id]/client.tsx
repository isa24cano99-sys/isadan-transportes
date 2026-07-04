'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, CheckCircle, ExternalLink, RefreshCw, Pencil, ScrollText, Trash2 } from 'lucide-react'
import { cambiarEstadoAction, generarFacturaAction, asignarVehiculoAction, asignarConductorAction, eliminarViajeAction } from './actions'
import type { TripDetail } from './actions'
import { formatCOP, formatDate } from '@/lib/utils'

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
  manifestPdfUrl,
  allVehicles,
  allDrivers,
}: {
  trip: TripDetail
  invoiceNumber: string | null
  pdfUrl: string | null
  manifestPdfUrl: string | null
  allVehicles: VehicleOption[]
  allDrivers: DriverOption[]
}) {
  const [trip, setTrip] = useState(initial)
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [changingStatus,   setChangingStatus]   = useState(false)
  const [assigningVehicle, setAssigningVehicle] = useState(false)
  const [assigningDriver,  setAssigningDriver]  = useState(false)
  const [selectedVehicle,  setSelectedVehicle]  = useState('')
  const [selectedDriver,   setSelectedDriver]   = useState('')
  const [savingVehicle,    setSavingVehicle]    = useState(false)
  const [savingDriver,     setSavingDriver]     = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const [invoiceResult, setInvoiceResult] = useState<{ number: string; pdfUrl: string } | null>(
    initialInvNum ? { number: initialInvNum, pdfUrl: initialPdf ?? '' } : null,
  )
  const [invoiceError, setInvoiceError] = useState<string | null>(null)

  const currentStatus = STATUS_FLOW.find(s => s.key === trip.status)
  const canInvoice = ['FINALIZADO', 'FACTURADO'].includes(trip.status)
  const alreadyInvoiced = !!trip.dataico_invoice_id || !!invoiceResult

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
    } else {
      setInvoiceError(res.error)
    }
    setInvoicing(false)
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
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
        <div className="flex items-center gap-2">
          {currentStatus && (
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${currentStatus.cls}`}>
              {currentStatus.label}
            </span>
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
          <Field label="Fecha de cargue">{formatDate(trip.load_date)}</Field>
        </div>

        {/* Cliente */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#64748B]">Cliente</p>
          <Field label="Razón social">
            <span className="font-medium">{trip.clients?.name ?? '—'}</span>
          </Field>
          {trip.clients?.nit && <Field label="NIT">{trip.clients.nit}</Field>}
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
                    <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>
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
                  {invoiceResult ? `✅ Factura ${invoiceResult.number} generada` : '✅ Factura generada'}
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Factura electrónica emitida y validada por la DIAN
                </p>
              </div>
              {(invoiceResult?.pdfUrl) && (
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
              <div className="flex items-center gap-4">
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
                <p className="text-xs text-[#94A3B8]">
                  Se facturará {formatCOP(trip.freight_value)} a{' '}
                  {trip.clients?.name ?? 'el cliente'}
                </p>
              </div>
            </div>
          )}
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
