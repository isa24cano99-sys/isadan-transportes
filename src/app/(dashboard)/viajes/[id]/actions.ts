'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { hoyColombia } from '@/lib/fecha'
import { calcularDV } from '@/lib/nit'
import { formatCOP } from '@/lib/utils'
import {
  parseNIT,
  findDataicoCustomer,
  createDataicoCustomer,
  createDataicoInvoice,
  createDataicoCreditNote,
  findNextFreeDataicoNumber,
  getDataicoInvoice,
  parseDateicoDate,
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
  tercero_id: string | null
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
      notes, status, dataico_invoice_id, tercero_id,
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
  { ok: false; error: string } | { ok: true; invoiceNumber: string; cufe: string; pdfUrl: string; warning?: string }
> {
  // 1. Load trip with relations
  const { data: raw, error: tripErr } = await supabase
    .from('trips')
    .select(`
      id, trip_number, manifest_number, origin, destination, load_date,
      freight_value, weight_kg, price_per_ton, load_content, status,
      clients(id, name, nit, email, tercero_id, terceros(numero_identificacion, digito_verificacion, razon_social, completo)),
      vehicles(id, plate)
    `)
    .eq('id', tripId)
    .single()

  if (tripErr || !raw) return { ok: false, error: 'Viaje no encontrado' }

  const trip = raw as any
  const client = Array.isArray(trip.clients) ? trip.clients[0] : trip.clients

  // 2. NIT autoritativo desde el TERCERO (numero_identificacion + digito_verificacion),
  //    no de clients.nit — así la emisión usa el NIT corregido/fusionado, no una copia vieja.
  const tercero = client && (Array.isArray(client.terceros) ? client.terceros[0] : client.terceros)
  let nitBase: string, dv: string, customerName: string
  if (tercero?.numero_identificacion) {
    nitBase = tercero.numero_identificacion
    dv = String(tercero.digito_verificacion ?? calcularDV(nitBase))
    customerName = tercero.razon_social || client?.name || ''
  } else if (client?.nit) {
    // fallback transitorio: cliente aún sin tercero enlazado
    const p = parseNIT(client.nit); nitBase = p.base; dv = p.dv
    customerName = client.name
  } else {
    return { ok: false, error: 'El cliente no tiene tercero ni NIT. Créalo/complétalo en /terceros antes de facturar.' }
  }

  // Aviso SUAVE (no bloquea): si el tercero está incompleto para exógena, se emite igual.
  // (Se volverá bloqueo duro cuando el maestro de terceros esté completo.)
  const terceroIncompleto = !!tercero && tercero.completo === false
  if (terceroIncompleto) console.warn(`[factura] tercero ${nitBase} incompleto para exógena — se emite igual (aviso suave)`)

  // 3. Ensure customer exists in Dataico (non-blocking)
  try {
    const existing = await findDataicoCustomer(nitBase)
    if (!existing) {
      await createDataicoCustomer({
        name: customerName,
        nit: nitBase,
        dv,
        email: client.email ?? undefined,
      })
    }
  } catch {
    // continue without Dataico customer sync
  }

  // 5. Consecutivo: primer número LIBRE en Dataico a partir del max de Supabase.
  //    Dataico manda (puede estar adelante si se crearon facturas manualmente).
  const { data: supabaseRows } = await supabase
    .from('invoices')
    .select('invoice_number')
    .ilike('invoice_number', 'FEIT%')

  const supabaseMax = (supabaseRows ?? [])
    .map(r => parseInt((r.invoice_number?.match(/(\d+)$/) ?? [])[1] ?? '0', 10))
    .reduce((max, n) => (n > max ? n : max), 0)

  let nextConsecutive: number
  try {
    nextConsecutive = await findNextFreeDataicoNumber('FEIT', supabaseMax > 0 ? supabaseMax + 1 : 1)
    console.log('ULTIMO EN SUPABASE:', supabaseMax, '· PRIMER LIBRE EN DATAICO:', nextConsecutive)
  } catch (e: any) {
    // Si Dataico no responde, caer a Supabase+1 (mejor que fallar)
    nextConsecutive = supabaseMax > 0 ? supabaseMax + 1 : 13
    console.log('No se pudo verificar en Dataico, uso Supabase+1:', nextConsecutive, '·', e.message)
  }
  console.log('SIGUIENTE CONSECUTIVO:', nextConsecutive)

  // Regla: si hay legalización APROBADA con flete distinto al manifiesto, facturar por ese flete.
  const { data: legApr } = await supabase
    .from('legalizations')
    .select('freight_value')
    .eq('trip_id', tripId)
    .eq('status', 'APROBADA')
    .maybeSingle()
  const legFreight = legApr?.freight_value != null ? Number(legApr.freight_value) : null
  const fleteAFacturar =
    legFreight != null && legFreight > 0 && legFreight !== Number(trip.freight_value)
      ? legFreight
      : Number(trip.freight_value)
  console.log('Flete manifiesto:', trip.freight_value, 'Flete legalización:', legApr?.freight_value, 'Usando:', fleteAFacturar)

  // 6. Create invoice in Dataico
  let invoice
  try {
    const vehicle = Array.isArray(trip.vehicles) ? trip.vehicles[0] : trip.vehicles
    invoice = await createDataicoInvoice({
      customerName:    customerName,
      customerNit:     nitBase,
      customerEmail:   client.email ?? undefined,
      nextConsecutive,
      date:            hoyColombia(),
      freightValue:  fleteAFacturar,
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

  // Store invoice number WITHOUT dash (e.g. "FEIT10"); the dash is added only for display.
  const invoiceNumber = String(dataico_response?.invoice?.number ?? dataico_response?.number ?? '').replace(/-/g, '')
  console.log('FACTURA CREADA EN DATAICO:', invoiceNumber)
  console.log('  invoice.uuid (Dataico):', invoice.uuid)
  console.log('  invoice_number (formateado):', invoiceNumber)

  // 6. Save to invoices table
  console.log('GUARDANDO EN SUPABASE...')
  const { error: supabaseInsertError } = await supabase.from('invoices').insert({
    trip_id:        tripId,
    invoice_number: invoiceNumber,
    cufe:           invoice.cufe,
    issue_date:     parseDateicoDate(invoice.issue_date),
    client_name:    customerName,
    client_nit:     nitBase,
    total_amount:   fleteAFacturar,
    tax_amount:     0,
    invoice_type:   'EMITIDA',
    dataico_id:     invoice.uuid,
    pdf_url:        invoice.pdf_url,
    xml_url:        invoice.xml_url,
  })
  console.log('RESULTADO SUPABASE:', supabaseInsertError ? supabaseInsertError : 'OK')
  if (supabaseInsertError) {
    console.error('ERROR AL GUARDAR FACTURA EN SUPABASE:', supabaseInsertError.message, supabaseInsertError.details)
    return { ok: false, error: `Factura creada en Dataico (${invoiceNumber}) pero no se pudo guardar en base de datos: ${supabaseInsertError.message}` }
  }

  // 7. Update trip status
  // NOTA: dataico_invoice_id guarda el UUID de Dataico (no el número de factura) porque
  // se usa como referencia al crear Notas Crédito. El número formateado está en invoices.invoice_number.
  console.log('ACTUALIZANDO VIAJE: status=FACTURADO, dataico_invoice_id=', invoice.uuid, '(UUID Dataico, no el número)')
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
    warning: terceroIncompleto ? 'El tercero está incompleto para exógena. Complétalo en /terceros.' : undefined,
  }
}

export type RegistroManualResult =
  | { status: 'ok'; invoiceNumber: string; reactivated?: boolean; linked?: boolean }
  | { status: 'reactivable'; invoiceNumber: string; message: string }
  | { status: 'vinculable'; invoiceNumber: string; message: string }
  | { status: 'blocked'; message: string }

/**
 * Marca un viaje como facturado MANUALMENTE: la factura se generó por fuera del flujo
 * automático (Dataico u otro medio) y el usuario solo registra el folio. Deriva
 * cliente/tercero del propio viaje (no los pide el formulario). Al ser manual no hay UUID
 * de Dataico → dataico_id/dataico_invoice_id = el folio. El folio queda listo para que el
 * auto-sugerido de /contabilidad/facturacion lo cruce con la DIAN por invoice_number.
 *
 * Manejo de folio existente (opción C acotada, 3 casos):
 *  · ANULADA sin cartera → REACTIVABLE: 2º paso confirmado reactiva y re-vincula la fila
 *    (limpia dian_status/credit_note_*, fija trip_id/total/fecha).
 *  · ACTIVA huérfana (trip_id=NULL, no anulada) → VINCULABLE: el usuario sabe qué viaje la
 *    generó. 2º paso confirmado fija SOLO trip_id — no toca total/dian_status/cartera.
 *    Guard: si el viaje ya tiene otra factura activa, bloquea (ambiguo).
 *  · Vinculada a OTRO viaje activo, o ya en este viaje → BLOQUEA con contexto.
 *  · No existe → INSERT normal.
 */
export async function registrarFacturaManualAction(params: {
  tripId: string
  invoiceNumber: string
  totalAmount: number
  date: string
  confirmReactivate?: boolean
  confirmVincular?: boolean
}): Promise<RegistroManualResult> {
  // Folio normalizado: sin guion, sin espacios, en mayúsculas (consistente con el resto).
  const invoiceNumber = String(params.invoiceNumber ?? '').replace(/-/g, '').replace(/\s+/g, '').toUpperCase()
  if (!invoiceNumber) return { status: 'blocked', message: 'Ingresa el número de factura (folio).' }
  if (!(params.totalAmount > 0)) return { status: 'blocked', message: 'El monto facturado debe ser mayor que cero.' }

  // Cliente/tercero autoritativos desde el viaje: tercero enlazado → fallback a clients.
  const { data: raw, error: tripErr } = await supabase
    .from('trips')
    .select('id, clients(name, nit, tercero_id, terceros(numero_identificacion, razon_social))')
    .eq('id', params.tripId)
    .single()
  if (tripErr || !raw) return { status: 'blocked', message: 'Viaje no encontrado' }
  const client = Array.isArray((raw as any).clients) ? (raw as any).clients[0] : (raw as any).clients
  const tercero = client && (Array.isArray(client.terceros) ? client.terceros[0] : client.terceros)
  const clientName = tercero?.razon_social || client?.name || 'Cliente'
  const clientNit  = tercero?.numero_identificacion || client?.nit || ''
  const terceroId  = client?.tercero_id ?? null

  // ¿El folio ya existe en invoices?
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, trip_id, dian_status, client_name')
    .eq('invoice_number', invoiceNumber)
    .maybeSingle()

  if (existing) {
    // ¿Hay cartera viva contra ese folio? (no PAGADA con saldo > 0)
    const { data: ar } = await supabase
      .from('accounts_receivable_entries')
      .select('balance, status')
      .eq('invoice_number', invoiceNumber)
    const carteraViva = (ar ?? []).find((e: any) => e.status !== 'PAGADA' && Number(e.balance) > 0)
    const carteraSaldo = carteraViva ? Number((carteraViva as any).balance) : 0
    const isAnulada = /anul/i.test(existing.dian_status ?? '')

    // (1) ANULADA sin cartera → reactivable (reactiva la fila muerta)
    if (isAnulada && !carteraViva) {
      if (!params.confirmReactivate) {
        let vinc = ''
        if (existing.trip_id) {
          const { data: t } = await supabase.from('trips').select('trip_number').eq('id', existing.trip_id).maybeSingle()
          vinc = t?.trip_number ? ` (estaba vinculada a ${t.trip_number})` : ''
        }
        return { status: 'reactivable', invoiceNumber, message:
          `El folio ${invoiceNumber} ya existe pero está anulado${vinc}, sin cartera activa. ¿Reactivar y vincular a este viaje?` }
      }
      // Confirmado → reactivar la fila existente (no se inserta una segunda)
      const { error: upErr } = await supabase.from('invoices').update({
        trip_id:            params.tripId,
        total_amount:       params.totalAmount,
        issue_date:         params.date,
        client_name:        clientName,
        client_nit:         clientNit,
        tercero_id:         terceroId,
        dian_status:        null,   // reactivar: quitar marca ANULADA
        credit_note_id:     null,   // quitar marca de anulación manual ('MANUAL')
        credit_note_number: null,
      }).eq('id', existing.id)
      if (upErr) return { status: 'blocked', message: upErr.message }
      const { error: tErr } = await supabase.from('trips')
        .update({ status: 'FACTURADO', dataico_invoice_id: invoiceNumber }).eq('id', params.tripId)
      if (tErr) return { status: 'blocked', message: tErr.message }
      revalidatePath('/viajes'); revalidatePath(`/viajes/${params.tripId}`)
      return { status: 'ok', invoiceNumber, reactivated: true }
    }

    // (3) ACTIVA huérfana (no anulada, trip_id=NULL) → vinculable. El usuario sabe qué viaje
    //     la generó; se fija SOLO trip_id sin tocar total/dian_status/cartera.
    if (!isAnulada && existing.trip_id == null) {
      // Guard: este viaje NO puede tener ya otra factura activa vinculada (ambiguo → bloquear).
      const { data: tripInvs } = await supabase.from('invoices')
        .select('invoice_number, dian_status').eq('trip_id', params.tripId)
      const otra = (tripInvs ?? []).find((i: any) =>
        i.invoice_number !== invoiceNumber && !/anul/i.test(i.dian_status ?? ''))
      if (otra) {
        return { status: 'blocked', message:
          `Este viaje ya está facturado con el folio ${(otra as any).invoice_number} — no se puede vincular ${invoiceNumber} también. Revisa cuál corresponde.` }
      }
      if (!params.confirmVincular) {
        const detalle = carteraViva
          ? `ya tiene ${formatCOP(carteraSaldo)} de cartera pendiente de ${existing.client_name ?? 'su cliente'}`
          : `ya existe (activa, sin viaje) de ${existing.client_name ?? 'su cliente'}`
        return { status: 'vinculable', invoiceNumber, message:
          `El folio ${invoiceNumber} ${detalle}. Al vincularlo a este viaje NO se modifica ese monto ni la cartera existente — `
          + `solo se registra que este viaje fue el que lo generó. ¿Confirmas?` }
      }
      // Confirmado → SOLO fijar trip_id (no toca total_amount, dian_status ni la cartera)
      const { error: upErr } = await supabase.from('invoices')
        .update({ trip_id: params.tripId }).eq('id', existing.id)
      if (upErr) return { status: 'blocked', message: upErr.message }
      const { error: tErr } = await supabase.from('trips')
        .update({ status: 'FACTURADO', dataico_invoice_id: invoiceNumber }).eq('id', params.tripId)
      if (tErr) return { status: 'blocked', message: tErr.message }
      revalidatePath('/viajes'); revalidatePath(`/viajes/${params.tripId}`)
      return { status: 'ok', invoiceNumber, linked: true }
    }

    // Resto → bloqueos con contexto
    if (existing.trip_id && existing.trip_id !== params.tripId) {
      const { data: t } = await supabase.from('trips').select('trip_number').eq('id', existing.trip_id).maybeSingle()
      return { status: 'blocked', message:
        `El folio ${invoiceNumber} ya existe y está vinculado al viaje ${t?.trip_number ?? 'otro'}${isAnulada ? ' (anulado)' : ' (activo)'} — no se puede reutilizar para este viaje.` }
    }
    if (existing.trip_id === params.tripId) {
      return { status: 'blocked', message: `El folio ${invoiceNumber} ya está registrado para este viaje.` }
    }
    // trip_id=NULL, anulada y con cartera (contradictorio) → bloquear
    return { status: 'blocked', message:
      `El folio ${invoiceNumber} ya existe, anulado y con cartera pendiente de ${formatCOP(carteraSaldo)} — revísalo antes de reutilizarlo.` }
  }

  // No existe → INSERT normal
  const { error: invErr } = await supabase.from('invoices').insert({
    trip_id:        params.tripId,
    invoice_number: invoiceNumber,
    issue_date:     params.date,
    client_name:    clientName,
    client_nit:     clientNit,
    total_amount:   params.totalAmount,
    tax_amount:     0,
    invoice_type:   'EMITIDA',
    dataico_id:     invoiceNumber,
    tercero_id:     terceroId,
  })
  if (invErr) {
    if (invErr.code === '23505' || /duplicate|unique/i.test(invErr.message)) {
      return { status: 'blocked', message: `El folio ${invoiceNumber} ya está registrado en otra factura.` }
    }
    return { status: 'blocked', message: invErr.message }
  }

  const { error: tripUpErr } = await supabase
    .from('trips')
    .update({ status: 'FACTURADO', dataico_invoice_id: invoiceNumber })
    .eq('id', params.tripId)
  if (tripUpErr) return { status: 'blocked', message: tripUpErr.message }

  revalidatePath('/viajes')
  revalidatePath(`/viajes/${params.tripId}`)
  return { status: 'ok', invoiceNumber }
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

const REASON_CODES: Record<string, 1 | 2 | 3 | 4> = {
  'Devolución':       1,
  'Descuento':        2,
  'Anulación':        3,
  'Rebaja de precio': 4,
}

export async function crearNotaCreditoAction(params: {
  tripId:      string
  invoiceUuid: string
  motivo:      string
  descripcion: string
  amount:      number
}): Promise<
  | { ok: false; error: string }
  | { ok: true; creditNoteUuid: string; creditNoteNumber: string }
> {
  const reasonCode = REASON_CODES[params.motivo]
  if (!reasonCode) return { ok: false, error: 'Motivo inválido' }

  // Resolver el UUID interno de Dataico (no el número de factura tipo 'FEIT12').
  const isUuid = (s: string | null | undefined) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s ?? '')

  let uuid = ''
  const { data: inv } = await supabase
    .from('invoices')
    .select('dataico_id, invoice_number')
    .eq('trip_id', params.tripId)
    .maybeSingle()

  console.log('invoice_number recibido:', inv?.invoice_number)
  console.log('dataico_id en DB:', inv?.dataico_id)

  // 1. UUID ya guardado en la factura (columna dataico_id)
  if (isUuid(inv?.dataico_id)) {
    uuid = inv!.dataico_id as string
  } else if (inv?.invoice_number) {
    // 2. Consultar Dataico por número: GET /invoices?number=FEIT12 → uuid
    try {
      const invoiceDataico = await getDataicoInvoice(inv.invoice_number as string) as any
      console.log('Resultado getDataicoInvoice:', invoiceDataico)
      uuid = invoiceDataico?.uuid ?? invoiceDataico?.id ?? ''
      // Cachear el UUID para no consultar de nuevo la próxima vez
      if (isUuid(uuid)) await supabase.from('invoices').update({ dataico_id: uuid }).eq('trip_id', params.tripId)
    } catch (e: any) {
      console.log('Resultado getDataicoInvoice: ERROR', e.message)
      return { ok: false, error: `No se pudo consultar la factura en Dataico: ${e.message}` }
    }
  } else {
    console.log('Resultado getDataicoInvoice: (no se consultó — sin invoice_number)')
  }
  // 3. Último recurso: el valor recibido, solo si es un UUID válido
  if (!isUuid(uuid) && isUuid(params.invoiceUuid)) uuid = params.invoiceUuid

  console.log('UUID final que se enviará a Dataico:', uuid)
  if (!isUuid(uuid)) {
    return { ok: false, error: 'No se pudo obtener el UUID interno de Dataico de la factura.' }
  }

  // Verificación: consultar la factura directamente en Dataico y comparar el UUID
  // que devuelve contra el que tenemos en DB (diagnóstico, no bloquea el flujo).
  try {
    const invoiceCheck = await getDataicoInvoice('FEIT19') as any
    console.log('UUID en DB:', inv?.dataico_id)
    console.log('UUID que devuelve Dataico:', invoiceCheck?.uuid ?? invoiceCheck?.id)
  } catch (e: any) {
    console.log('Verificación getDataicoInvoice(FEIT19): ERROR', e.message)
  }

  let cn
  try {
    cn = await createDataicoCreditNote({
      invoiceUuid:  uuid,
      reasonCode,
      description:  params.descripcion || `Nota crédito — ${params.motivo}`,
      amount:       params.amount,
    })
  } catch (e: any) {
    return { ok: false, error: `Error Dataico: ${e.message}` }
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      credit_note_id:     cn.uuid,
      credit_note_number: cn.number,
    })
    .eq('trip_id', params.tripId)

  if (error) {
    // Dataico call succeeded — return success even if DB write failed
    console.error('[crearNotaCredito] DB update error:', error.message)
  }

  revalidatePath(`/viajes/${params.tripId}`)
  return { ok: true, creditNoteUuid: cn.uuid, creditNoteNumber: cn.number }
}

/**
 * Marca la factura del viaje como anulada MANUALMENTE en Dataico (cuando la nota
 * crédito se hizo por fuera de la app). No llama a Dataico: solo refleja el estado.
 *  · invoices: dian_status='ANULADA', credit_note_id='MANUAL' (distingue de las anuladas por la app)
 *  · trips: status='FINALIZADO' + dataico_invoice_id=null → permite refacturar si es necesario
 * En el Estado de Resultados el filtro dian_status='ANULADA' la excluye automáticamente.
 */
export async function marcarFacturaAnuladaManualAction(
  tripId: string,
): Promise<{ ok: boolean; error?: string; invoiceNumber?: string }> {
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .update({ dian_status: 'ANULADA', credit_note_id: 'MANUAL' })
    .eq('trip_id', tripId)
    .select('invoice_number')
    .maybeSingle()

  if (invErr) return { ok: false, error: invErr.message }

  const { error: tripErr } = await supabase
    .from('trips')
    .update({ status: 'FINALIZADO', dataico_invoice_id: null })
    .eq('id', tripId)

  if (tripErr) return { ok: false, error: tripErr.message }

  revalidatePath(`/viajes/${tripId}`)
  revalidatePath('/viajes')
  revalidatePath('/facturas', 'layout')
  return { ok: true, invoiceNumber: inv?.invoice_number ?? undefined }
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

  // Sincronizar la legalización en BORRADOR con el nuevo vehículo (solo el campo que cambió)
  const { error: legErr } = await supabase
    .from('legalizations')
    .update({ vehicle_id: vehicleId })
    .eq('trip_id', tripId)
    .eq('status', 'BORRADOR')
  if (legErr) console.error('[asignarVehiculo] sync legalización BORRADOR:', legErr.message)

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

  // Sincronizar la legalización en BORRADOR con el nuevo conductor (solo el campo que cambió)
  console.log('Actualizando legalización con driver_id:', driverId, 'para trip_id:', tripId)
  const { data: legData, error: legErr } = await supabase
    .from('legalizations')
    .update({ driver_id: driverId })
    .eq('trip_id', tripId)
    .eq('status', 'BORRADOR')
    .select()
  console.log('Legalización actualizada:', legData, 'Error:', legErr)
  if (legErr) console.error('[asignarConductor] sync legalización BORRADOR:', legErr.message)

  revalidatePath(`/viajes/${tripId}`)
  return { ok: true, driver }
}
