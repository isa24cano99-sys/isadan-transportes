/**
 * Tipo `Trip` compartido para los SELECTORES de viaje (bancos, legalizaciones,
 * asignación de peajes, etc.). Incluye `manifest_number` como opcional y admite
 * la placa tanto plana (`plate`) como anidada (`vehicles.plate`), que es como
 * la traen las distintas queries. Compatible con `formatTripOption` /
 * `tripMatchesQuery` de `@/lib/utils`.
 *
 * Nota: los formularios que necesitan el viaje COMPLETO (p. ej. la legalización,
 * con driver_id/clients/freight_value) usan su propio tipo más rico; este es solo
 * para la selección.
 */
export type Trip = {
  id:               string
  trip_number:      string
  manifest_number?: string | null
  origin:           string
  destination:      string
  load_date:        string | null
  plate?:           string | null
  vehicles?:        { plate: string | null } | null
}
