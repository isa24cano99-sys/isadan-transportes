export type CategoryType = 'NEGOCIO' | 'CASA'

export type Category = { value: string; label: string; type: CategoryType }

export const PREDEFINED: Category[] = [
  // NEGOCIO
  { value: 'FLETE',         label: 'Flete',             type: 'NEGOCIO' },
  { value: 'ANTICIPO',      label: 'Anticipo',           type: 'NEGOCIO' },
  { value: 'COMBUSTIBLE',   label: 'Combustible',        type: 'NEGOCIO' },
  { value: 'PEAJE',         label: 'Peaje',              type: 'NEGOCIO' },
  { value: 'NOMINA',        label: 'Nómina',             type: 'NEGOCIO' },
  { value: 'PRESTAMO',      label: 'Préstamo',           type: 'NEGOCIO' },
  { value: 'IMPUESTO',      label: 'Impuesto',           type: 'NEGOCIO' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento',      type: 'NEGOCIO' },
  { value: 'OTRO_NEGOCIO',  label: 'Otro (negocio)',     type: 'NEGOCIO' },
  { value: 'OTRO',          label: 'Otro',               type: 'NEGOCIO' }, // legacy
  // CASA
  { value: 'LUZ',            label: 'Luz',              type: 'CASA' },
  { value: 'AGUA',           label: 'Agua',             type: 'CASA' },
  { value: 'TV_INTERNET',    label: 'TV / Internet',    type: 'CASA' },
  { value: 'TELEFONO',       label: 'Teléfono',         type: 'CASA' },
  { value: 'SALUD',          label: 'Salud',            type: 'CASA' },
  { value: 'GASOLINA_CARRO', label: 'Gasolina (carro)', type: 'CASA' },
  { value: 'COMIDAS',        label: 'Comidas',          type: 'CASA' },
  { value: 'SALIDAS',        label: 'Salidas',          type: 'CASA' },
  { value: 'MANUTENCION',    label: 'Manutención',      type: 'CASA' },
  { value: 'ARRIENDO',       label: 'Arriendo',         type: 'CASA' },
  { value: 'OTRO_CASA',      label: 'Otro (casa)',       type: 'CASA' },
]

export const PREDEFINED_TYPE_MAP: Record<string, CategoryType> = Object.fromEntries(
  PREDEFINED.map(c => [c.value, c.type]),
)

export const PREDEFINED_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PREDEFINED.map(c => [c.value, c.label]),
)

export function getCategoryType(
  value: string,
  custom: { name: string; type: string }[],
): CategoryType | null {
  if (PREDEFINED_TYPE_MAP[value]) return PREDEFINED_TYPE_MAP[value]
  const found = custom.find(c => c.name === value)
  return (found?.type as CategoryType) ?? null
}

export function getCategoryLabel(
  value: string,
  custom: { name: string; type: string }[],
): string {
  if (PREDEFINED_LABEL_MAP[value]) return PREDEFINED_LABEL_MAP[value]
  return value
}
