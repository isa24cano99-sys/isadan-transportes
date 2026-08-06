'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import {
  parseManifiestoTexto, fechaPortalToISO, valorPortalToNumber, construirNotasExtra,
} from '@/lib/manifiesto-texto'

/**
 * client_id legado (en PARALELO a tercero_id): se deriva del tercero elegido buscando
 * su fila en clients. tercero_id es el valor autoritativo (el que eligió el usuario,
 * intacto); esto solo mantiene client_id poblado para lo que aún lo lee. Devuelve null
 * si el tercero no tiene fila en clients (columna nullable) → no se sobreescribe.
 */
async function derivarClientId(terceroId: string): Promise<string | null> {
  if (!terceroId) return null
  const { data } = await supabase.from('clients').select('id').eq('tercero_id', terceroId).limit(1)
  return data?.[0]?.id ?? null
}

function extractFields(formData: FormData) {
  return {
    manifest_number: (formData.get('manifest_number') as string) || null,
    manifest_auth:   (formData.get('manifest_auth') as string) || null,
    tercero_id:      formData.get('tercero_id') as string,
    vehicle_id:      formData.get('vehicle_id') as string,
    driver_id:       formData.get('driver_id') as string,
    origin:          formData.get('origin') as string,
    destination:     formData.get('destination') as string,
    load_date:       formData.get('load_date') as string,
    freight_value:   Number(formData.get('freight_value')),
    advance_amount:  Number(formData.get('advance_amount') ?? 0),
    notes:           (formData.get('notes') as string) || null,
    weight_kg:       formData.get('weight_kg') ? Number(formData.get('weight_kg')) || null : null,
    price_per_ton:   formData.get('price_per_ton') ? Number(formData.get('price_per_ton')) || null : null,
    load_content:    (formData.get('load_content') as string) || null,
  }
}

export async function crearViajeAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const fields = extractFields(formData)

  if (!fields.tercero_id || !fields.vehicle_id || !fields.driver_id ||
      !fields.origin || !fields.destination || !fields.load_date || !fields.freight_value) {
    return { ok: false, error: 'Completa todos los campos obligatorios' }
  }

  // Anti-duplicado por manifest_auth (el Radicado del portal) — misma clave que usa el
  // flujo de PDF. Solo aplica si viene autorización; los viajes manuales sin manifiesto no
  // la traen y no se bloquean.
  if (fields.manifest_auth) {
    const { data: dup } = await supabase
      .from('trips').select('trip_number').eq('manifest_auth', fields.manifest_auth).maybeSingle()
    if (dup) {
      return { ok: false, error: `Ese manifiesto (autorización ${fields.manifest_auth}) ya está cargado en el viaje ${dup.trip_number ?? ''}` }
    }
  }

  const client_id = await derivarClientId(fields.tercero_id)
  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...fields, client_id, status: 'PLANEADO' })
    .select('id')
    .single()

  if (error || !trip) {
    console.error(error)
    return { ok: false, error: 'Error al guardar el viaje' }
  }

  // Crear legalización BORRADOR automáticamente (igual que el flujo de manifiesto),
  // para que ningún viaje quede sin legalización. driver_id/vehicle_id son obligatorios arriba.
  console.log('Creando legalización para viaje:', trip.id)
  const { error: legError } = await supabase.from('legalizations').insert({
    trip_id:        trip.id,
    driver_id:      fields.driver_id,
    vehicle_id:     fields.vehicle_id,
    date:           fields.load_date,
    advance_amount: fields.advance_amount ?? 0,
    total_expenses: 0,
    status:         'BORRADOR',
  })
  console.log('Resultado legalización:', legError ? legError : 'OK')

  revalidatePath('/viajes')
  return { ok: true }
}

export async function editarViajeAction(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const fields = extractFields(formData)

  if (!fields.tercero_id || !fields.vehicle_id || !fields.driver_id ||
      !fields.origin || !fields.destination || !fields.load_date || !fields.freight_value) {
    return { ok: false, error: 'Completa todos los campos obligatorios' }
  }

  // client_id legado en paralelo: solo se sobreescribe si el tercero tiene fila en clients.
  const client_id = await derivarClientId(fields.tercero_id)
  const payload = client_id ? { ...fields, client_id } : fields
  const { error } = await supabase.from('trips').update(payload).eq('id', id)

  if (error) {
    console.error(error)
    return { ok: false, error: 'Error al guardar los cambios' }
  }

  // Sincronizar el anticipo con la legalización en BORRADOR de este viaje (si existe).
  // Solo se toca en BORRADOR: si ya está PENDIENTE/APROBADA no se modifican sus valores.
  const { error: legError } = await supabase
    .from('legalizations')
    .update({ advance_amount: fields.advance_amount })
    .eq('trip_id', id)
    .eq('status', 'BORRADOR')
  if (legError) console.error('[editarViaje] error actualizando legalización BORRADOR:', legError.message)

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true }
}

export async function actualizarEstadoAction(id: string, status: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('trips').update({ status }).eq('id', id)
  if (error) return { ok: false }
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${id}`)
  return { ok: true }
}

export type ManifiestoParseResult = {
  ok: boolean
  error?: string
  // valores para llenar el formulario (los que tienen columna en trips)
  manifest_number: string | null
  manifest_auth:   string | null   // Radicado
  origin:          string | null
  destination:     string | null
  load_date:       string | null   // ISO, desde Fecha viaje
  freight_value:   number | null
  advance_amount:  number | null
  driver_id:       string | null
  tercero_id:      string | null
  notes:           string          // bloque con los campos sin columna (retenciones, etc.)
  // info para mostrar al usuario qué se resolvió y qué quedó pendiente
  conductor_texto: string | null   // "1020485007 DANIEL CANO GARCIA"
  empresa_texto:   string | null
  driverEncontrado: boolean
  terceroEncontrado: boolean
  terceroAmbiguo:  boolean         // varios clientes coinciden con el nombre → no se asigna
  yaExiste:        boolean         // el Radicado ya está cargado
  yaExisteViaje:   string | null
}

/**
 * Parsea el texto pegado del portal de manifiestos y resuelve conductor (por cédula) y
 * cliente (por nombre, best-effort — el texto no trae NIT del cliente). NO crea nada: solo
 * devuelve valores para que el formulario los precargue y el usuario revise antes de crear.
 */
export async function parsearManifiestoTextoAction(texto: string): Promise<ManifiestoParseResult> {
  const vacio = (extra: Partial<ManifiestoParseResult>): ManifiestoParseResult => ({
    ok: false, manifest_number: null, manifest_auth: null, origin: null, destination: null,
    load_date: null, freight_value: null, advance_amount: null, driver_id: null, tercero_id: null,
    notes: '', conductor_texto: null, empresa_texto: null, driverEncontrado: false,
    terceroEncontrado: false, terceroAmbiguo: false, yaExiste: false, yaExisteViaje: null, ...extra,
  })

  if (!texto || texto.trim().length < 20) {
    return vacio({ error: 'Pega el texto del portal de manifiestos.' })
  }

  const m = parseManifiestoTexto(texto)
  if (!m.radicado && !m.manifiesto && !m.origen) {
    return vacio({ error: 'No se reconoció el formato del portal. Verifica que pegaste el texto completo.' })
  }

  // Resolver conductor por cédula
  let driver_id: string | null = null
  if (m.conductor_doc) {
    const { data } = await supabase.from('drivers').select('id').eq('document', m.conductor_doc).maybeSingle()
    driver_id = data?.id ?? null
  }

  // Resolver cliente (tercero) por NOMBRE — best-effort, el portal no da NIT del cliente.
  // Filtrado a es_cliente=true para que coincida con las opciones del <select> del form.
  // Se busca por el NÚCLEO del nombre (sin la forma jurídica S.A.S/LTDA/etc.) para que
  // "TRANSPORTES TSG S.A.S" del portal encuentre "TRANSPORTES TSG S.A.S." en la BD pese a
  // que los puntos difieran — el núcleo "TRANSPORTES TSG" es substring de ambos.
  // Falla seguro ante ambigüedad: si el núcleo coincide con MÁS DE UN cliente, no se
  // asigna ninguno (terceroAmbiguo=true) para no arriesgar poner el viaje en el cliente
  // equivocado — el usuario lo elige a mano. Solo se asigna con match ÚNICO.
  let tercero_id: string | null = null
  let terceroAmbiguo = false
  if (m.empresa) {
    const core = m.empresa
      .replace(/\s*(S\.?\s*A\.?\s*S\.?|LTDA\.?|E\.?\s*U\.?|S\.?\s*A\.?S?\.?)\s*\.?$/i, '')
      .replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
    if (core.length >= 3) {
      const { data } = await supabase
        .from('terceros').select('id, razon_social')
        .eq('es_cliente', true).ilike('razon_social', `%${core}%`).is('merged_into', null).limit(2)
      if (data && data.length === 1) tercero_id = data[0].id
      else if (data && data.length > 1) terceroAmbiguo = true
    }
  }

  // ¿el Radicado ya está cargado? (anti-duplicado por manifest_auth, misma clave que el PDF)
  let yaExiste = false, yaExisteViaje: string | null = null
  if (m.radicado) {
    const { data } = await supabase.from('trips').select('trip_number').eq('manifest_auth', m.radicado).maybeSingle()
    if (data) { yaExiste = true; yaExisteViaje = data.trip_number ?? null }
  }

  return {
    ok: true,
    manifest_number: m.manifiesto,
    manifest_auth:   m.radicado,
    origin:          m.origen,
    destination:     m.destino,
    load_date:       fechaPortalToISO(m.fecha_viaje),
    freight_value:   valorPortalToNumber(m.valor_viaje),
    advance_amount:  valorPortalToNumber(m.valor_anticipo),
    driver_id,
    tercero_id,
    notes:           construirNotasExtra(m),
    conductor_texto: m.conductor_doc ? `${m.conductor_doc} ${m.conductor_nombre ?? ''}`.trim() : m.conductor_nombre,
    empresa_texto:   m.empresa,
    driverEncontrado:  !!driver_id,
    terceroEncontrado: !!tercero_id,
    terceroAmbiguo,
    yaExiste,
    yaExisteViaje,
  }
}
