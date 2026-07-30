/**
 * Validación de identificación DIAN (NIT / cédula) — dígito de verificación módulo 11.
 * Ver también la función SQL `calcular_dv` (migración terceros) que replica esto en la DB.
 */

const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

/** Deja solo dígitos (sin puntos, guiones ni espacios). */
export function normalizarIdentificacion(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '')
}

/** Dígito de verificación DIAN (módulo 11) del NIT. */
export function calcularDV(nit: string): number {
  const d = normalizarIdentificacion(nit).split('').reverse()
  let suma = 0
  for (let i = 0; i < d.length; i++) suma += Number(d[i]) * PESOS[i]
  const residuo = suma % 11
  return residuo < 2 ? residuo : 11 - residuo
}

/** ¿El DV dado coincide con el calculado para el NIT? */
export function validarDV(nit: string, dv: number): boolean {
  return calcularDV(nit) === dv
}

/**
 * Detecta un NIT con el dígito de verificación PEGADO: 10 dígitos que empiezan por
 * 8 o 9 donde el 10º dígito es el DV de los primeros 9. Devuelve {base, dv} o null.
 * (Un NIT de persona jurídica colombiana tiene 9 dígitos; 10 con este patrón es el
 *  NIT+DV mal capturado.)
 */
export function esNitConDVPegado(valor: string): { base: string; dv: number } | null {
  const x = normalizarIdentificacion(valor)
  if (!/^[89]\d{9}$/.test(x)) return null
  const base = x.slice(0, 9)
  const dv = Number(x[9])
  return calcularDV(base) === dv ? { base, dv } : null
}

/**
 * Valida una identificación al guardar un tercero. Devuelve error legible o null.
 * Reglas:
 *  - NIT (tipo_documento '31'): DV obligatorio y debe coincidir; rechaza 10 dígitos
 *    que empiecen por 8/9 (es un NIT+DV pegado, no existe en el RUT).
 *  - Cédula (tipo '13'): sin DV.
 */
export function validarIdentificacion(
  tipoDocumento: string,
  numero: string,
  dv: number | null,
): string | null {
  const num = normalizarIdentificacion(numero)
  if (!num) return 'La identificación es obligatoria.'
  if (String(numero) !== num) return 'La identificación debe ser solo dígitos (sin puntos ni guiones).'

  if (tipoDocumento === '31') {
    if (esNitConDVPegado(num)) return 'El NIT tiene el dígito de verificación pegado (10 dígitos). Usa los 9 dígitos base y el DV aparte.'
    if (dv == null) return 'El NIT requiere dígito de verificación.'
    if (!validarDV(num, dv)) return `El DV no coincide: para ${num} el DV correcto es ${calcularDV(num)}.`
  } else if (dv != null) {
    return 'Solo el NIT (tipo 31) lleva dígito de verificación.'
  }
  return null
}
