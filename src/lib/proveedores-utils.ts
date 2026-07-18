/** Utilidades puras del módulo de proveedores (sin 'use server'). */

/** True si la categoría del catálogo corresponde a un cliente ('CLIENTE', 'CLIENTE_ANTICIPO', …). */
export const isClientCategoria = (c: string | null | undefined): boolean =>
  !!c && c.toUpperCase().startsWith('CLIENTE')
