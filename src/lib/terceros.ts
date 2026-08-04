/**
 * Resolución de terceros por NIT crudo — punto de entrada único para normalizar
 * identificaciones antes de guardarlas (importador de manifiestos y cualquier otro
 * flujo que reciba un NIT de texto libre / OCR).
 *
 * Evita los duplicados de terceros que causaba guardar el NIT con el dígito de
 * verificación PEGADO (ej. "9009415081" en vez de base "900941508" + DV "1").
 */

import { supabase } from '@/lib/supabase'
import { calcularDV, normalizarIdentificacion } from '@/lib/nit'

export type ResolucionTercero = {
  terceroId: string
  base: string           // NIT base normalizado (sin DV)
  dv: number             // DV correcto (calculado, módulo 11)
  created: boolean       // true si hubo que crear el tercero
  warning: string | null // advertencia para revisión manual (no bloquea)
}

/** Busca un tercero ACTIVO (no fusionado) por número de identificación exacto. */
async function buscarActivoPorNumero(numero: string) {
  const { data } = await supabase
    .from('terceros')
    .select('id, numero_identificacion, digito_verificacion, merged_into')
    .eq('numero_identificacion', numero)
    .is('merged_into', null)
    .limit(1)
  return data?.[0] ?? null
}

/**
 * Resuelve (y si hace falta crea) el tercero correspondiente a un NIT crudo.
 * Algoritmo:
 *   1. Limpia el string → solo dígitos.
 *   2. Match exacto contra un tercero activo → úsalo.
 *   3. Si no hay match y son 10 dígitos: separa el último, calcula el DV del resto;
 *      si coincide, es un NIT+DV pegado → busca el tercero por el NIT base.
 *   4. Si sigue sin match → crea un tercero nuevo con numero = NIT base y
 *      digito_verificacion = el CALCULADO (nunca el que traiga el documento si difiere).
 *   5. Si el documento trae un DV separado que no coincide con el calculado, no bloquea:
 *      deja una advertencia (warning) para revisión manual.
 */
export async function resolverTerceroPorNitCrudo(
  nitCrudo: string | null | undefined,
  datos?: { nombre?: string | null; dvDocumento?: string | number | null; rol?: 'CLIENTE' | 'PROVEEDOR' },
): Promise<ResolucionTercero> {
  const limpio = normalizarIdentificacion(nitCrudo)
  if (!limpio) throw new Error('NIT vacío o sin dígitos.')

  // (2) match exacto contra un tercero activo
  const exacto = await buscarActivoPorNumero(limpio)
  if (exacto) {
    return {
      terceroId: exacto.id,
      base: exacto.numero_identificacion,
      dv: exacto.digito_verificacion ?? calcularDV(exacto.numero_identificacion),
      created: false,
      warning: null,
    }
  }

  // (3) ¿NIT+DV pegado? 10 dígitos cuyo último dígito es el DV de los primeros 9.
  let base = limpio
  let pegadoValido = false
  if (limpio.length === 10) {
    const posibleBase = limpio.slice(0, 9)
    const ultimo = Number(limpio[9])
    if (calcularDV(posibleBase) === ultimo) {
      base = posibleBase
      pegadoValido = true
      const porBase = await buscarActivoPorNumero(base)
      if (porBase) {
        return {
          terceroId: porBase.id,
          base: porBase.numero_identificacion,
          dv: porBase.digito_verificacion ?? ultimo,
          created: false,
          warning: null,
        }
      }
    }
  }

  // (4) tercero nuevo — numero = base, dv = el CALCULADO
  const dvCalc = calcularDV(base)

  // (5) advertencias para revisión manual (no bloquean la carga)
  const avisos: string[] = []
  const dvDoc = datos?.dvDocumento
  if (dvDoc != null && String(dvDoc).trim() !== '' && Number(dvDoc) !== dvCalc) {
    avisos.push(`El DV del documento (${dvDoc}) no coincide con el calculado (${dvCalc}) para el NIT ${base}.`)
  }
  if (limpio.length === 10 && !pegadoValido) {
    avisos.push(`El NIT "${limpio}" tiene 10 dígitos pero el último no es un DV válido; se guardó como base ${base} con DV ${dvCalc}.`)
  }
  const warning = avisos.length ? avisos.join(' ') + ' Revisión manual.' : null

  // Rol del tercero: por defecto CLIENTE (caso manifiesto). El punto de creación del
  // banco puede pasar 'PROVEEDOR'. Un tercero puede terminar siendo ambos con el tiempo.
  const esProveedor = datos?.rol === 'PROVEEDOR'
  const { data: creado, error } = await supabase
    .from('terceros')
    .insert({
      tipo_persona:          'JURIDICA',
      tipo_documento:        '31',        // NIT
      numero_identificacion: base,
      digito_verificacion:   dvCalc,
      razon_social:          datos?.nombre?.trim() || null,
      es_cliente:            !esProveedor,
      es_proveedor:          esProveedor,
      activo:                true,
    })
    .select('id')
    .single()

  if (error || !creado) {
    // Condición de carrera: otro proceso creó el mismo tercero entre el buscar y el insert.
    // El índice único parcial (terceros_identificacion_uk) lo rechaza con 23505; en ese
    // caso re-consultamos y devolvemos el ganador en vez de fallar y dejar el viaje sin tercero.
    if (error?.code === '23505') {
      const ganador = await buscarActivoPorNumero(base)
      if (ganador) {
        return {
          terceroId: ganador.id,
          base: ganador.numero_identificacion,
          dv: ganador.digito_verificacion ?? dvCalc,
          created: false,
          warning,
        }
      }
    }
    throw new Error(`No se pudo crear el tercero ${base}: ${error?.message}`)
  }

  return { terceroId: creado.id, base, dv: dvCalc, created: true, warning }
}
