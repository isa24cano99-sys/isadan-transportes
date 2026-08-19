'use server'

import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'

// Fila plana lista para Excel: los FK (conductor/vehículo/cliente) ya vienen resueltos a
// nombre legible; el cliente filtra por `id` según lo que esté viendo en pantalla.
export type ViajeExportRow = {
  id: string
  trip_number: string
  status: string
  manifest_number: string | null
  manifest_auth: string | null
  load_date: string | null
  delivery_date: string | null
  origin: string
  destination: string
  cliente: string
  nit_cliente: string
  conductor: string
  placa: string
  vehiculo: string
  load_content: string | null
  weight_kg: number | null
  price_per_ton: number | null
  freight_value: number | null
  advance_amount: number | null
  factura: string
  fecha_factura: string | null
  estado_legalizacion: string
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export async function getViajesExportData(): Promise<ViajeExportRow[]> {
  // fetchAll: trips crece cada mes — sin paginar se truncaría a 1000 y el export saldría incompleto.
  const [trips, legs] = await Promise.all([
    fetchAll<any>((from, to) => supabase.from('trips').select(`
      id, trip_number, status, manifest_number, manifest_auth, load_date, delivery_date,
      origin, destination, load_content, weight_kg, price_per_ton, freight_value, advance_amount,
      notes, created_at, updated_at,
      terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona, numero_identificacion),
      clients(name, nit),
      vehicles(plate, brand, model),
      drivers(full_name),
      invoices(invoice_number, issue_date, dian_status)
    `).order('load_date', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).range(from, to)),
    fetchAll<any>((from, to) => supabase.from('legalizations').select('trip_id, status').order('id', { ascending: true }).range(from, to)),
  ])

  // Estado de legalización por viaje: si hay varias, gana APROBADA.
  const legByTrip = new Map<string, string>()
  for (const l of legs) {
    if (!l.trip_id) continue
    const cur = legByTrip.get(l.trip_id)
    if (!cur || l.status === 'APROBADA') legByTrip.set(l.trip_id, l.status)
  }

  return (trips as any[]).map(t => {
    const ter = t.terceros
    const cliente = (ter ? nombreTercero(ter) : '') || t.clients?.name || ''
    const v = t.vehicles
    const invs = (t.invoices ?? []) as any[]
    const inv = invs.find(i => !/anul/i.test(i.dian_status ?? '')) ?? invs[0]
    return {
      id: t.id,
      trip_number: t.trip_number,
      status: t.status,
      manifest_number: t.manifest_number,
      manifest_auth: t.manifest_auth,
      load_date: t.load_date,
      delivery_date: t.delivery_date,
      origin: t.origin,
      destination: t.destination,
      cliente,
      nit_cliente: ter?.numero_identificacion || t.clients?.nit || '',
      conductor: t.drivers?.full_name ?? '',
      placa: v?.plate ?? '',
      vehiculo: v ? [v.brand, v.model].filter(Boolean).join(' ') : '',
      load_content: t.load_content,
      weight_kg: t.weight_kg,
      price_per_ton: t.price_per_ton,
      freight_value: t.freight_value,
      advance_amount: t.advance_amount,
      factura: inv?.invoice_number ?? '',
      fecha_factura: inv?.issue_date ?? null,
      estado_legalizacion: legByTrip.get(t.id) ?? '',
      notes: t.notes,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }
  })
}
