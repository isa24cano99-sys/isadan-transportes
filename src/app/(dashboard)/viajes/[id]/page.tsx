import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ViajeDetailClient from './client'
import { getTripAction } from './actions'

export default async function ViajeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTripAction(id)
  if (!trip) notFound()

  const [invoiceRes, vehiclesRes, driversRes, legRes] = await Promise.all([
    trip.dataico_invoice_id
      ? supabase.from('invoices').select('invoice_number, pdf_url, credit_note_id, credit_note_number').eq('trip_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('vehicles').select('id, plate, brand, model').order('plate'),
    supabase.from('drivers').select('id, full_name').order('full_name'),
    supabase.from('legalizations').select('freight_value').eq('trip_id', id).eq('status', 'APROBADA').maybeSingle(),
  ])

  const invoiceNumber    = invoiceRes.data?.invoice_number    ?? null
  const invoicePdfUrl    = invoiceRes.data?.pdf_url           ?? null
  const creditNoteId     = invoiceRes.data?.credit_note_id    ?? null
  const creditNoteNumber = invoiceRes.data?.credit_note_number ?? null

  // Advertencia: legalización aprobada con flete distinto al manifiesto → se factura por ese flete
  const legFreight      = (legRes.data as any)?.freight_value != null ? Number((legRes.data as any).freight_value) : null
  const manifestFreight = Number(trip.freight_value ?? 0)
  const fleteWarning =
    legFreight != null && legFreight > 0 && legFreight !== manifestFreight
      ? { legFreight, manifestFreight }
      : null

  let manifestPdfUrl: string | null = null
  if (trip.manifest_pdf_path) {
    const { data } = await supabase.storage
      .from('documentos')
      .createSignedUrl(trip.manifest_pdf_path, 3600)
    manifestPdfUrl = data?.signedUrl ?? null
  }

  return (
    <ViajeDetailClient
      trip={trip}
      invoiceNumber={invoiceNumber}
      pdfUrl={invoicePdfUrl}
      creditNoteId={creditNoteId}
      creditNoteNumber={creditNoteNumber}
      manifestPdfUrl={manifestPdfUrl}
      fleteWarning={fleteWarning}
      allVehicles={vehiclesRes.data ?? []}
      allDrivers={driversRes.data ?? []}
    />
  )
}
