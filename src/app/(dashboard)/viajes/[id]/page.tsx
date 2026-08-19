import Link from 'next/link'
import { ArrowLeft, PackageX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import ViajeDetailClient from './client'
import { getTripAction } from './actions'

// Anticipo disponible del cliente: saldo de 28050510 (crédito − débito) para el tercero.
// OJO: es a nivel CLIENTE, no de este viaje — el anticipo se recibe por tercero y puede
// cubrir varios viajes; no hay vínculo anticipo↔manifiesto en el modelo.
async function getAnticipoCliente(terceroId: string): Promise<number> {
  const lineas = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select('debito, credito, journal_entries!inner(estado)')
    .eq('cuenta_puc', '28050510')
    .eq('tercero_id', terceroId)
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))
  return lineas.reduce((s, l) => s + (Number(l.credito) || 0) - (Number(l.debito) || 0), 0)
}

export default async function ViajeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTripAction(id)

  // Viaje inexistente (null o error de Supabase) → estado claro, no 404 (que rompe la navegación)
  if (!trip) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
          <PackageX size={26} className="text-[#94A3B8]" />
        </div>
        <h1 className="text-lg font-semibold text-[#0F172A]">Viaje no encontrado</h1>
        <p className="text-sm text-[#64748B] mt-1 max-w-sm">
          El viaje que buscas no existe o fue eliminado.
        </p>
        <Link
          href="/viajes"
          className="mt-5 inline-flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <ArrowLeft size={15} /> Volver a viajes
        </Link>
      </div>
    )
  }

  const [invoiceRes, vehiclesRes, driversRes, legRes] = await Promise.all([
    // Siempre por trip_id: la anulación manual limpia trip.dataico_invoice_id, pero la
    // factura anulada sigue existiendo y hay que leerla para mostrar el badge y excluirla.
    supabase.from('invoices')
      .select('invoice_number, pdf_url, credit_note_id, credit_note_number')
      .eq('trip_id', id)
      .order('issue_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('vehicles').select('id, plate, brand, model').order('plate'),
    supabase.from('drivers').select('id, full_name').order('full_name'),
    supabase.from('legalizations').select('freight_value').eq('trip_id', id).eq('status', 'APROBADA').maybeSingle(),
  ])

  // Factura anulada manualmente (credit_note_id='MANUAL') → no se trata como factura activa,
  // para que el viaje quede refacturable; el badge "Anulada manualmente" se muestra igual.
  const inv = invoiceRes.data as any
  const anuladaManual    = inv?.credit_note_id === 'MANUAL'
  const invoiceNumber    = anuladaManual ? null : (inv?.invoice_number ?? null)
  const invoicePdfUrl    = anuladaManual ? null : (inv?.pdf_url ?? null)
  const creditNoteId     = inv?.credit_note_id     ?? null
  const creditNoteNumber = inv?.credit_note_number ?? null

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

  // Anticipo TOTAL disponible del cliente (28050510) — null si el viaje no tiene tercero enlazado.
  const anticipoCliente = trip.tercero_id ? await getAnticipoCliente(trip.tercero_id) : null

  return (
    <ViajeDetailClient
      trip={trip}
      invoiceNumber={invoiceNumber}
      pdfUrl={invoicePdfUrl}
      creditNoteId={creditNoteId}
      creditNoteNumber={creditNoteNumber}
      manifestPdfUrl={manifestPdfUrl}
      fleteWarning={fleteWarning}
      anticipoCliente={anticipoCliente}
      allVehicles={vehiclesRes.data ?? []}
      allDrivers={driversRes.data ?? []}
    />
  )
}
