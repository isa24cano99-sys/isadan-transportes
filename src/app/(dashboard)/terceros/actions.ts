'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { calcularDV, normalizarIdentificacion, validarIdentificacion } from '@/lib/nit'

export type TerceroForm = {
  tipo_persona: string
  tipo_documento: string
  numero_identificacion: string
  digito_verificacion: string | number | null
  razon_social?: string | null
  primer_apellido?: string | null
  segundo_apellido?: string | null
  primer_nombre?: string | null
  otros_nombres?: string | null
  direccion?: string | null
  codigo_pais?: string | null
  codigo_departamento?: string | null
  codigo_municipio?: string | null
  email?: string | null
  telefono?: string | null
  es_cliente?: boolean
  es_proveedor?: boolean
  cuenta_puc_sugerida?: string | null
}

function buildRow(d: TerceroForm) {
  const numero = normalizarIdentificacion(d.numero_identificacion)
  const dvNum = d.digito_verificacion === '' || d.digito_verificacion == null ? null : Number(d.digito_verificacion)
  return {
    row: {
      tipo_persona:          d.tipo_persona,
      tipo_documento:        d.tipo_documento,
      numero_identificacion: numero,
      digito_verificacion:   d.tipo_documento === '31' ? (dvNum ?? calcularDV(numero)) : null,
      razon_social:          d.razon_social?.trim() || null,
      primer_apellido:       d.primer_apellido?.trim() || null,
      segundo_apellido:      d.segundo_apellido?.trim() || null,
      primer_nombre:         d.primer_nombre?.trim() || null,
      otros_nombres:         d.otros_nombres?.trim() || null,
      direccion:             d.direccion?.trim() || null,
      codigo_pais:           d.codigo_pais?.trim() || '169',
      codigo_departamento:   d.codigo_departamento?.trim() || null,
      codigo_municipio:      d.codigo_municipio?.trim() || null,
      email:                 d.email?.trim() || null,
      telefono:              d.telefono?.trim() || null,
      es_cliente:            !!d.es_cliente,
      es_proveedor:          !!d.es_proveedor,
      cuenta_puc_sugerida:   d.cuenta_puc_sugerida?.trim() || null,
    },
    numero,
    dvNum,
  }
}

export async function guardarTerceroAction(
  id: string | null,
  data: TerceroForm,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { row, numero, dvNum } = buildRow(data)
  const err = validarIdentificacion(data.tipo_documento, numero, dvNum)
  if (err) return { ok: false, error: err }

  if (id) {
    const { error } = await supabase.from('terceros').update(row).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/terceros')
    return { ok: true, id }
  }
  const { data: ins, error } = await supabase.from('terceros').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/terceros')
  return { ok: true, id: ins.id }
}

/** Fusiona dos terceros vía la función atómica en Postgres (fusionar_terceros). */
export async function fusionarTerceroAction(
  idSobreviviente: string,
  idDuplicado: string,
): Promise<{ ok: boolean; error?: string; afectadas?: unknown }> {
  const { data, error } = await supabase.rpc('fusionar_terceros', {
    id_sobreviviente: idSobreviviente,
    id_duplicado:     idDuplicado,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/terceros')
  return { ok: true, afectadas: data }
}
