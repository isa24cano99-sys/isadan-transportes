'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  procesarManifiestoAction,
  reemplazarManifiestoAction,
  type ManifiestoExtraido,
} from '@/app/(dashboard)/viajes/nuevo-manifiesto/actions'
import { formatCOP } from '@/lib/utils'

type ModalState =
  | { type: 'duplicate'; extracted: ManifiestoExtraido; existingTripId: string; existingTripNumber: string; message: string }
  | null

function ExtractedFields({ data }: { data: ManifiestoExtraido }) {
  const rows = [
    { label: 'Autorización',  value: data.manifest_auth },
    { label: 'N° Manifiesto', value: data.manifest_number },
    { label: 'Placa',         value: data.plate },
    { label: 'Fecha cargue',  value: data.load_date },
    { label: 'Origen',        value: data.origin },
    { label: 'Destino',       value: data.destination },
    { label: 'Mercancía',     value: data.load_content },
    { label: 'Peso',          value: data.weight_kg ? `${data.weight_kg.toLocaleString('es-CO')} kg` : null },
    { label: 'Cliente',       value: data.client_name },
    { label: 'NIT cliente',   value: data.client_nit },
    { label: 'Valor flete',   value: data.freight_value != null ? formatCOP(data.freight_value) : null },
    { label: 'Anticipo',      value: data.advance_amount != null ? formatCOP(data.advance_amount) : null },
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="bg-[#F8FAFC] rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">{label}</p>
          <p className={`text-xs mt-0.5 font-medium ${value ? 'text-[#0F172A]' : 'text-[#CBD5E1]'}`}>
            {value ?? 'No detectado'}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function ManifiestoUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging,    setDragging]    = useState(false)
  const [processing,  setProcessing]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [modal,       setModal]       = useState<ModalState>(null)
  const [confirming,  setConfirming]  = useState(false)
  const [pdfBase64,   setPdfBase64]   = useState('')

  const processFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se aceptan archivos PDF')
      return
    }
    setError(null)
    setProcessing(true)

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    setPdfBase64(base64)
    const result = await procesarManifiestoAction(base64)
    setProcessing(false)

    if (!result.ok && 'duplicate' in result && result.duplicate) {
      setModal({
        type: 'duplicate',
        extracted:          result.extracted,
        existingTripId:     result.existing_trip_id,
        existingTripNumber: result.existing_trip_number,
        message:            result.message,
      })
    } else if (result.ok) {
      router.push(`/viajes/${result.trip_id}`)
    } else if (!result.ok && 'error' in result) {
      setError(result.error)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleReplace = async () => {
    if (modal?.type !== 'duplicate') return
    setConfirming(true)
    const res = await reemplazarManifiestoAction(modal.existingTripId, pdfBase64)
    setConfirming(false)
    if (res.ok) {
      setModal(null)
      router.push(`/viajes/${res.trip_id}`)
    } else {
      setModal(null)
      setError(res.error)
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Cargar manifiesto PDF"
        className={`border-2 border-dashed rounded-lg p-4 flex items-center gap-4 cursor-pointer transition-colors select-none ${
          dragging
            ? 'border-[#2563EB] bg-blue-50'
            : 'border-[#E2E8F0] hover:border-blue-400 hover:bg-blue-50/30'
        }`}
        onClick={() => !processing && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && !processing && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) processFile(f)
            e.target.value = ''
          }}
        />

        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
          {processing
            ? <RefreshCw size={18} className="text-blue-500 animate-spin" />
            : <Upload size={18} className="text-blue-500" />
          }
        </div>
        <div>
          <p className="text-sm font-medium text-[#0F172A]">
            {processing ? 'Procesando manifiesto…' : 'Cargar manifiesto de carga'}
          </p>
          <p className="text-xs text-[#64748B]">
            {processing
              ? 'Extrayendo datos del PDF'
              : 'Arrastra el PDF aquí o haz click · Solo PDF del Ministerio de Transporte'
            }
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-3">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Modal overlay — solo aparece para manifiestos duplicados */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-start gap-3 p-5 border-b border-[#E2E8F0]">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#0F172A]">Este manifiesto ya existe</h3>
                <p className="text-sm text-[#64748B] mt-1">
                  La Autorizacion <strong className="text-[#0F172A]">{modal.extracted.manifest_auth}</strong> ya fue cargada en el viaje{' '}
                  <strong className="text-[#0F172A]">{modal.existingTripNumber}</strong>.
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-sm text-[#64748B]">
                Deseas reemplazar el manifiesto anterior con este nuevo archivo? Esto actualizara todos los datos del viaje existente.
              </p>
              <ExtractedFields data={modal.extracted} />
            </div>
            <div className="flex gap-3 p-5 border-t border-[#E2E8F0]">
              <button
                onClick={() => setModal(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReplace}
                disabled={confirming}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {confirming ? 'Actualizando...' : 'Si, reemplazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
