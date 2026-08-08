/**
 * Campos de gasto fijos de las legalizaciones (siempre visibles en el formulario).
 * `key` = expense_type que se persiste en legalization_expenses; `puc` para el comprobante.
 *
 * Vive en un módulo neutral (sin 'use server' ni 'use client') para poder importarse
 * tanto desde el formulario (client) como desde páginas server (editar) sin cruzar el
 * boundary RSC — importar un valor runtime desde un módulo 'use client' a un server
 * component devuelve una referencia de cliente, no el array real.
 */
// puc verificado contra el catálogo PUC (6145xx). Antes 6 estaban mal (lavada→Porcentaje,
// parqueos→Alistada, engrase→Parqueadero, llantas→Lavada, cambio_aceite→Parqueadero,
// varada→Fumigación); corregidos. Este mapa debe coincidir con el CASE de aprobar_legalizacion.
export const FIXED_FIELDS: { key: string; label: string; puc: string }[] = [
  { key: 'acpm_contado',  label: 'ACPM / Combustible',         puc: '61450510' },
  { key: 'cargue',        label: 'Cargue',                     puc: '61450515' },
  { key: 'descargue',     label: 'Descargue',                  puc: '61450535' },
  { key: 'peajes',        label: 'Peajes',                     puc: '61450575' },
  { key: 'lavada',        label: 'Lavada',                     puc: '61450555' },
  { key: 'parqueos',      label: 'Parqueos',                   puc: '61450545' },
  { key: 'engrase',       label: 'Engrase',                    puc: '61450540' },
  { key: 'llantas',       label: 'Llantas',                    puc: '61450590' },
  { key: 'carrozada',     label: 'Carrozada / Parchada carpa', puc: '61450570' },
  { key: 'cambio_aceite', label: 'Cambio aceite / Repuestos',  puc: '61450530' },
  { key: 'varada',        label: 'Varada / Otros servicios',   puc: '61450525' },
]
