'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import {
  parseNIT,
  findDataicoCustomer,
  createDataicoCustomer,
  createDataicoInvoice,
} from '@/lib/dataico'

export type TripDetail = {
  id: string
  trip_number: string
  manifest_auth: string | null
  manifest_number: string | null
  manifest_pdf_path: string | null
  origin: string
  destination: string
  load_date: string
  freight_value: number
  advance_amount: number
  weight_kg: number | null
  price_per_ton: number | null
  load_content: string | null
  notes: string | null
  status: string
  dataico_invoice_id: string | null
  clients: { id: string; name: string; nit: string | null; email: string | null } | null
  vehicles: { id: string; plate: string; brand: string; model: string } | null
  drivers: { id: string; full_name: string } | null
}

export async function getTripAction(id: string): Promise<TripDetail | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(`
      id, trip_number, manifest_auth, manifest_number, manifest_pdf_path,
      origin, destination, load_date,
      freight_value, advance_amount, weight_kg, price_per_ton, load_content,
      notes, status, dataico_invoice_id,
      clients(id, name, nit, email),
      vehicles(id, plate, brand, model),
      drivers(id, full_name)
    `)
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as unknown as TripDetail
}

export async function cambiarEstadoAction(id: string, status: string) {
  const { error } = await supabase.from('trips').update({ status }).eq('id', id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true as const }
}

export async function generarFacturaAction(tripId: string): Promise<
  { ok: false; error: string } | { ok: true; invoiceNumber: string; cufe: string; pdfUrl: string }
> {
  // 1. Load trip with relations
  const { data: raw, error: tripErr } = await supabase
    .from('trips')
    .select(`
      id, trip_number, manifest_number, origin, destination, load_date,
      freight_value, weight_kg, price_per_ton, load_content, status,
      clients(id, name, nit, email),
      vehicles(id, plate)
    `)
    .eq('id', tripId)
    .single()

  if (tripErr || !raw) return { ok: false, error: 'Viaje no encontrado' }

  const trip = raw as any
  const client = Array.isArray(trip.clients) ? trip.clients[0] : trip.clients

  if (!client?.nit) return { ok: false, error: 'El cliente no tiene NIT registrado. Agrégalo en la ficha del cliente.' }

  // 2. Parse NIT → base + DV
  const { base: nitBase, dv } = parseNIT(client.nit)

  // 3. Ensure customer exists in Dataico (non-blocking)
  try {
    const existing = await findDataicoCustomer(nitBase)
    if (!existing) {
      await createDataicoCustomer({
        name: client.name,
        nit: nitBase,
        dv,
        email: client.email ?? undefined,
      })
    }
  } catch {
    // continue without Dataico customer sync
  }

  // 5. Calculate next consecutive from Supabase invoices table (fallback: 12, since FEIT-11 already exists)
  const { data: lastInvoiceRow } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastNum = lastInvoiceRow?.invoice_number
    ? parseInt((lastInvoiceRow.invoice_number.match(/(\d+)$/) ?? [])[1] ?? '0', 10)
    : 0
  const nextConsecutive = lastNum > 0 ? lastNum + 1 : 12
  console.log('NEXT CONSECUTIVE (from Supabase):', nextConsecutive, '— last invoice_number:', lastInvoiceRow?.invoice_number)

  // 6. Create invoice in Dataico
  let invoice
  try {
    const vehicle = Array.isArray(trip.vehicles) ? trip.vehicles[0] : trip.vehicles
    invoice = await createDataicoInvoice({
      customerName:    client.name,
      customerNit:     nitBase,
      customerEmail:   client.email ?? undefined,
      nextConsecutive,
      date:            new Date().toISOString().split('T')[0],
      freightValue:  Number(trip.freight_value),
      plate:         vehicle?.plate ?? '',
      origin:        trip.origin,
      destination:   trip.destination,
      loadContent:   trip.load_content ?? undefined,
      weightKg:      trip.weight_kg    ?? undefined,
      pricePerTon:   trip.price_per_ton ?? undefined,
      manifestNumber: trip.manifest_number ?? undefined,
    })
  } catch (e: any) {
    return { ok: false, error: `Error Dataico: ${e.message}` }
  }

  const dataico_response = invoice as any
  console.log('DATAICO FULL RESPONSE:', JSON.stringify(dataico_response, null, 2))

  // Format invoice number: "FEIT10" → "FEIT-10"
  const invoiceNumber = (dataico_response?.invoice?.number ?? dataico_response?.number ?? '').replace(/^([A-Z]+)(\d+)$/, '$1-$2')

  // 6. Save to invoices table (non-blocking if table doesn't exist)
  await supabase.from('invoices').insert({
    trip_id:        tripId,
    invoice_number: invoiceNumber,
    cufe:           invoice.cufe,
    issue_date:     invoice.issue_date,
    client_name:    client.name,
    client_nit:     client.nit,
    total_amount:   trip.freight_value,
    tax_amount:     0,
    invoice_type:   'EMITIDA',
    dataico_id:     invoice.uuid,
    pdf_url:        invoice.pdf_url,
    xml_url:        invoice.xml_url,
  })

  // 7. Update trip status and store Dataico UUID
  await supabase
    .from('trips')
    .update({ status: 'FACTURADO', dataico_invoice_id: invoice.uuid })
    .eq('id', tripId)

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${tripId}`)

  return {
    ok: true,
    invoiceNumber,
    cufe:   invoice.cufe,
    pdfUrl: invoice.pdf_url,
  }
}

export async function registrarFacturaManualAction(params: {
  tripId: string
  invoiceNumber: string
  cufe: string
  clientName: string
  clientNit: string
  totalAmount: number
  date: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error: invErr } = await supabase.from('invoices').insert({
    trip_id:        params.tripId,
    invoice_number: params.invoiceNumber,
    cufe:           params.cufe || null,
    issue_date:     params.date,
    client_name:    params.clientName,
    client_nit:     params.clientNit,
    total_amount:   params.totalAmount,
    tax_amount:     0,
    invoice_type:   'EMITIDA',
    dataico_id:     params.invoiceNumber,
  })
  if (invErr) return { ok: false, error: invErr.message }

  const { error: tripErr } = await supabase
    .from('trips')
    .update({ status: 'FACTURADO', dataico_invoice_id: params.invoiceNumber })
    .eq('id', params.tripId)
  if (tripErr) return { ok: false, error: tripErr.message }

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${params.tripId}`)
  return { ok: true }
}

export async function eliminarViajeAction(tripId: string): Promise<{ ok: boolean; error?: string }> {
  // 1. Get legalization IDs
  const { data: legs, error: legsErr } = await supabase
    .from('legalizations').select('id').eq('trip_id', tripId)
  if (legsErr) {
    console.error('[eliminarViaje] legalizaciones:', legsErr)
    return { ok: false, error: legsErr.message }
  }

  // 2. Delete legalization_expenses
  const legIds = (legs ?? []).map(l => l.id)
  if (legIds.length > 0) {
    const { error: expErr } = await supabase
      .from('legalization_expenses').delete().in('legalization_id', legIds)
    if (expErr) {
      console.error('[eliminarViaje] legalization_expenses:', expErr)
      return { ok: false, error: expErr.message }
    }
  }

  // 3. Delete legalizations
  const { error: legErr } = await supabase
    .from('legalizations').delete().eq('trip_id', tripId)
  if (legErr) {
    console.error('[eliminarViaje] legalizations:', legErr)
    return { ok: false, error: legErr.message }
  }

  // 4. Delete invoices
  const { error: invErr } = await supabase
    .from('invoices').delete().eq('trip_id', tripId)
  if (invErr) {
    console.error('[eliminarViaje] invoices:', invErr)
    return { ok: false, error: invErr.message }
  }

  // 5. Delete trip
  const { error: tripErr } = await supabase
    .from('trips').delete().eq('id', tripId)
  if (tripErr) {
    console.error('[eliminarViaje] trips:', tripErr)
    return { ok: false, error: tripErr.message }
  }

  revalidatePath('/viajes')
  return { ok: true }
}

export async function asignarVehiculoAction(tripId: string, vehicleId: string): Promise<
  | { ok: false; error: string }
  | { ok: true; vehicle: { id: string; plate: string; brand: string; model: string } }
> {
  const { data: vehicle } = await supabase
    .from('vehicles').select('id, plate, brand, model').eq('id', vehicleId).single()
  if (!vehicle) return { ok: false, error: 'Vehiculo no encontrado' }
  const { error } = await supabase.from('trips').update({ vehicle_id: vehicleId }).eq('id', tripId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/viajes/${tripId}`)
  return { ok: true, vehicle }
}

export async function asignarConductorAction(tripId: string, driverId: string): Promise<
  | { ok: false; error: string }
  | { ok: true; driver: { id: string; full_name: string } }
> {
  const { data: driver } = await supabase
    .from('drivers').select('id, full_name').eq('id', driverId).single()
  if (!driver) return { ok: false, error: 'Conductor no encontrado' }
  const { error } = await supabase.from('trips').update({ driver_id: driverId }).eq('id', tripId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/viajes/${tripId}`)
  return { ok: true, driver }
}
