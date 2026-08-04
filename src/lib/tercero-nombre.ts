/**
 * Nombre a mostrar de un tercero: razón social si es JURIDICA, o el nombre completo
 * armado (primer_nombre + otros_nombres + apellidos) si es NATURAL.
 * Mismo criterio que usa el buscador del banco (buscarProveedoresAction).
 */
export function nombreTercero(t: {
  tipo_persona?: string | null
  razon_social?: string | null
  primer_nombre?: string | null
  otros_nombres?: string | null
  primer_apellido?: string | null
  segundo_apellido?: string | null
}): string {
  return t.tipo_persona === 'NATURAL'
    ? [t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido].filter(Boolean).join(' ')
    : (t.razon_social ?? '')
}
