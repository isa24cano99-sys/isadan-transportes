'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { extractText } from 'unpdf'

async function extractTextFromPDF(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
  return text
}

export type ManifiestoExtraido = {
  manifest_auth:   string | null
  manifest_number: string | null
  plate:           string | null
  driver_doc:      string | null
  origin:          string | null
  destination:     string | null
  load_date:       string | null
  load_content:    string | null
  weight_kg:       number | null
  freight_value:   number | null
  advance_amount:  number | null
  client_name:     string | null
  client_nit:      string | null
}

function extract(text: string, regex: RegExp): string | null {
  const m = text.match(regex)
  return m?.[1] ? m[1].trim() : null
}

function parseNum(raw: string | null): number | null {
  if (!raw) return null
  // Colombian manifest format: comma = thousands separator, period = decimal
  const cleaned = raw.replace(/,/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function parseManifestDate(raw: string | null): string | null {
  if (!raw) return null
  const normalized = raw.replace(/\//g, '-')            // '2026/06/20' → '2026-06-20'
  return new Date(normalized + 'T12:00:00').toISOString().split('T')[0]
}

function extractFields(text: string): ManifiestoExtraido {
  // Second page has clean labels: "Placa Vehículo : TSV130"
  const plate =
    extract(text, /Placa\s+Veh[ií]culo\s*:\s*([A-Z]{2,3}\d{3,4})/i) ??
    extract(text, /([A-Z]{2,3}\d{3,4})\s+PLACA\s+TITULAR/i) ??
    extract(text, /PLACA\s+TITULAR\s+([A-Z]{2,3}\d{3,4})/i)

  // Company name ends in S.A.S/LTDA/etc. and is followed by Tel: or Nit:
  const client_name = extract(
    text,
    /([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑA-Z\s]+?(?:S\.A\.S\.?|LTDA\.?|E\.U\.?|S\.A\.))\s+(?:Tel:|Nit:)/i,
  )

  // Destination: label followed by placeholder digits and "No de LICENCIA CITY DEPT"
  const destination =
    extract(text, /DESTINO DEL VIAJE\s+[\d\s]+No\s+de\s+LICENCIA\s+([A-ZÁÉÍÓÚÜÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{3,})?)/i) ??
    extract(text, /No\s+de\s+LICENCIA\s+([A-ZÁÉÍÓÚÜÑ]{4,}\s+[A-ZÁÉÍÓÚÜÑ]{4,})/i)

  // Product: 6-digit packing code followed by product name, then shipper company name
  const loadContentMatch = text.match(/\d{6}\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,30}?)\s+(?:LACTALIS|COLOMBIANA|ANDINA|SA\s|LTDA|S\.A|SAS)/i)
  const load_content = loadContentMatch?.[1]?.trim() ?? null

  // Financial values appear in sequence after "LUGAR DE PAGO FECHA":
  // [total] [retFuente] [retICA] [neto] [anticipo]
  const vm = text.match(
    /LUGAR DE PAGO FECHA\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/i,
  )

  return {
    manifest_auth:   extract(text, /Autorización[:\s]*(\d+)/i),
    manifest_number: extract(text, /Manifiesto\s*:\s*(\w+)/i),
    plate,
    // Second page has clean "CC: 1020485007" right after the auth number
    driver_doc:
      extract(text, /\bCC:\s*(\d{7,10})/i) ??
      extract(text, /(\d{7,10})\s+(?:CR|CL|KR|AV|DG|TV|CALLE|CARRERA|CARERRA)\s/i) ??
      extract(text, /(\d{8,10})\s+DOCUMENTO IDENTIFICACION\s+(?:[A-ZÁÉÍÓÚ]+\s+){2,}POSEEDOR/i),
    // Stop before TELEFONOS/CIUDAD/No de which always follow the city+dept pair
    origin:      extract(text, /ORIGEN DEL VIAJE\s+([A-ZÁÉÍÓÚÜÑ]+(?:\s+(?!TELEFONOS\b|CIUDAD\b|No\b)[A-ZÁÉÍÓÚÜÑ]+){0,2})/i),
    destination,
    load_date:   parseManifestDate(extract(text, /FECHA DE EXPEDICION\s+(\d{4}\/\d{2}\/\d{2})/i)),
    load_content,
    weight_kg:      parseNum(extract(text, /([\d,.]+)\s*Kilogramos/i)),
    freight_value:  vm ? parseNum(vm[1]) : null,
    advance_amount: vm ? parseNum(vm[5]) : null,
    client_name,
    client_nit:  extract(text, /Nit[:\s]+(\d+)/i),
  }
}

async function uploadPDF(base64: string, authKey: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')
  const path = `manifiestos/manifiesto_${authKey}.pdf`
  const { error } = await supabase.storage
    .from('documentos')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(error.message)
  return path
}

async function ensureClient(name: string, nit: string): Promise<string> {
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('nit', nit)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from('clients')
    .insert({ name, nit, active: true })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id
}

export type ProcesarResult =
  | { ok: false; duplicate: true; existing_trip_id: string; existing_trip_number: string; message: string; extracted: ManifiestoExtraido }
  | { ok: false; error: string }
  | { ok: true; trip_id: string; extracted: ManifiestoExtraido }

export async function procesarManifiestoAction(pdfBase64: string): Promise<ProcesarResult> {
  // 1. Parse PDF text
  let text: string
  try {
    text = await extractTextFromPDF(pdfBase64)
  } catch (e: any) {
    return { ok: false, error: `No se pudo leer el PDF: ${e.message}` }
  }

  // 2. Extract fields
  console.log('=== TEXTO COMPLETO DEL PDF ===')
  console.log(text)
  console.log('=== FIN TEXTO ===')
  const extracted = extractFields(text)
  console.log('===== CAMPOS EXTRAÍDOS =====', JSON.stringify(extracted))

  if (!extracted.manifest_auth) {
    return {
      ok: false,
      error: 'No se encontró número de Autorización en el PDF. Verifica que sea un manifiesto electrónico del Ministerio de Transporte.',
    }
  }

  // 3. Check duplicate
  const { data: existing } = await supabase
    .from('trips')
    .select('id, trip_number')
    .eq('manifest_auth', extracted.manifest_auth)
    .maybeSingle()

  if (existing) {
    return {
      ok: false,
      duplicate: true,
      existing_trip_id:     existing.id,
      existing_trip_number: existing.trip_number ?? existing.id,
      message: `Este manifiesto ya fue cargado en el viaje ${existing.trip_number ?? existing.id}`,
      extracted,
    }
  }

  // 4. Resolve vehicle, driver, client
  let vehicle_id: string | null = null
  let driver_id:  string | null = null
  let client_id:  string | null = null

  if (extracted.plate) {
    const { data, error } = await supabase.from('vehicles').select('id').ilike('plate', extracted.plate.replace('-', '')).maybeSingle()
    console.log(`[VEHICULO] placa="${extracted.plate}" → ${data?.id ?? 'NO ENCONTRADO'} err=${error?.message ?? 'ok'}`)
    vehicle_id = data?.id ?? null
  } else {
    console.log('[VEHICULO] placa no extraída del PDF')
  }
  if (extracted.driver_doc) {
    const { data, error } = await supabase.from('drivers').select('id').eq('document', extracted.driver_doc).maybeSingle()
    console.log(`[CONDUCTOR] doc="${extracted.driver_doc}" → ${data?.id ?? 'NO ENCONTRADO'} err=${error?.message ?? 'ok'}`)
    driver_id = data?.id ?? null
  } else {
    console.log('[CONDUCTOR] documento no extraído del PDF')
  }
  if (extracted.client_name && extracted.client_nit) {
    try { client_id = await ensureClient(extracted.client_name, extracted.client_nit) } catch { /* non-fatal */ }
  }

  // 5. Upload PDF
  let manifest_pdf_path: string | null = null
  try { manifest_pdf_path = await uploadPDF(pdfBase64, extracted.manifest_auth) } catch { /* non-fatal */ }

  // 6. Create trip
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      manifest_auth:    extracted.manifest_auth,
      manifest_number:  extracted.manifest_number ?? null,
      manifest_pdf_path,
      client_id,
      vehicle_id,
      driver_id,
      origin:           extracted.origin      ?? '',
      destination:      extracted.destination ?? '',
      load_date:        extracted.load_date   ?? new Date().toISOString().slice(0, 10),
      load_content:     extracted.load_content ?? null,
      weight_kg:        extracted.weight_kg   ?? null,
      freight_value:    extracted.freight_value ?? 0,
      advance_amount:   extracted.advance_amount ?? 0,
      status:           'EN_CURSO',
    })
    .select('id')
    .single()

  if (tripErr || !trip) return { ok: false, error: `Error al crear el viaje: ${tripErr?.message}` }

  // 7. Create legalization draft
  if (driver_id) {
    await supabase.from('legalizations').insert({
      trip_id:        trip.id,
      driver_id,
      date:           extracted.load_date ?? new Date().toISOString().slice(0, 10),
      advance_amount: extracted.advance_amount ?? 0,
      total_expenses: 0,
      status:         'BORRADOR',
    })
  }

  revalidatePath('/viajes')
  return { ok: true, trip_id: trip.id, extracted }
}

export async function reemplazarManifiestoAction(
  existingTripId: string,
  pdfBase64: string,
): Promise<{ ok: false; error: string } | { ok: true; trip_id: string }> {
  // 1. Parse new PDF
  let text: string
  try {
    text = await extractTextFromPDF(pdfBase64)
  } catch (e: any) {
    return { ok: false, error: `No se pudo leer el PDF: ${e.message}` }
  }

  const extracted = extractFields(text)

  // 2. Get existing trip for old PDF path
  const { data: existingTrip } = await supabase
    .from('trips')
    .select('manifest_pdf_path, manifest_auth')
    .eq('id', existingTripId)
    .single()

  // 3. Delete old PDF from storage
  if (existingTrip?.manifest_pdf_path) {
    await supabase.storage.from('documentos').remove([existingTrip.manifest_pdf_path])
  }

  // 4. Upload new PDF
  const authKey = extracted.manifest_auth ?? existingTrip?.manifest_auth ?? existingTripId
  let manifest_pdf_path: string | null = null
  try { manifest_pdf_path = await uploadPDF(pdfBase64, authKey) } catch { /* non-fatal */ }

  // 5. Resolve vehicle / driver from new PDF
  let vehicle_id: string | null | undefined = undefined
  let driver_id:  string | null | undefined = undefined

  if (extracted.plate) {
    const { data } = await supabase.from('vehicles').select('id').ilike('plate', extracted.plate.replace('-', '')).maybeSingle()
    vehicle_id = data?.id ?? null
  }
  if (extracted.driver_doc) {
    const { data } = await supabase.from('drivers').select('id').eq('document', extracted.driver_doc).maybeSingle()
    driver_id = data?.id ?? null
  }

  // 6. Update trip with all new data
  await supabase.from('trips').update({
    manifest_pdf_path,
    manifest_number:  extracted.manifest_number  ?? null,
    origin:           extracted.origin           ?? undefined,
    destination:      extracted.destination      ?? undefined,
    load_date:        extracted.load_date        ?? undefined,
    load_content:     extracted.load_content     ?? null,
    weight_kg:        extracted.weight_kg        ?? null,
    freight_value:    extracted.freight_value    ?? undefined,
    advance_amount:   extracted.advance_amount   ?? undefined,
    ...(vehicle_id !== undefined ? { vehicle_id } : {}),
    ...(driver_id  !== undefined ? { driver_id  } : {}),
  }).eq('id', existingTripId)

  // 7. Update legalization draft advance
  if (extracted.advance_amount != null) {
    await supabase
      .from('legalizations')
      .update({ advance_amount: extracted.advance_amount })
      .eq('trip_id', existingTripId)
      .eq('status', 'BORRADOR')
  }

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${existingTripId}`)
  return { ok: true, trip_id: existingTripId }
}
