export function normalizarDescripcion(desc: string): string {
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'en', 'a', 'los', 'las', 'del', 'al', 'y', 'o', 'por',
  'para', 'con', 'se', 'un', 'una', 'al', 'su', 'sus',
])

export function extraerPatron(descripcion: string): string {
  const normed = normalizarDescripcion(descripcion)
  const words = normed
    .split(' ')
    .filter(w =>
      w.length > 2 &&
      !STOP_WORDS.has(w) &&
      !/^[\d\-\/]+$/.test(w),
    )
    .slice(0, 4)
  return words.join(' ')
}

const RULES: { keywords: string[]; category: string }[] = [
  { keywords: ['flypass', 'peaje'],                                              category: 'Peajes operación' },
  { keywords: ['4x1000', 'impto gobierno', 'gmf'],                              category: 'GMF 4x1000' },
  { keywords: ['cuota manejo'],                                                  category: 'Cuota de manejo' },
  { keywords: ['intereses ahorros', 'abono intereses'],                         category: 'Intereses bancarios recibidos' },
  { keywords: ['seguro', 'poliza', 'fap mundial'],                              category: 'Seguros vehículos' },
  { keywords: ['nomina', 'salario', 'quincena'],                                category: 'Nómina conductores' },
  { keywords: ['seguridad social', 'aportes en linea'],                         category: 'Seguridad social' },
  { keywords: ['comfama'],                                                        category: 'Caja de compensación' },
  { keywords: ['epm', 'energia electrica'],                                      category: 'Energía eléctrica' },
  { keywords: ['comcel', 'claro'],                                               category: 'Celular empresa' },
  { keywords: ['supermercado', 'mercanorte', 'mercado', 'exito', 'jumbo'],     category: 'Supermercado' },
  { keywords: ['restaurante', 'almorzar', 'helado', 'arepa', 'empanada', 'frisby', 'comida'], category: 'Alimentación y restaurantes' },
  { keywords: ['consignacion anticipo', 'anticipo tsg', 'anticipo carga', 'anticipo logicer'], category: 'Anticipo de cliente' },
  { keywords: ['anticipo daniel', 'anticipo jorge', 'anticipo camilo', 'anticipo conductor', 'giro conductor'], category: 'Anticipo conductor' },
  { keywords: ['dataico'],                                                        category: 'Software contable' },
  { keywords: ['camara de comercio'],                                             category: 'Registro mercantil' },
  { keywords: ['arriendo', 'arrendamiento'],                                     category: 'Arrendamiento' },
  { keywords: ['prestamo', 'credito personal'],                                  category: 'Otros gastos personales' },
  { keywords: ['acpm', 'combustible', 'gasolina tractomula'],                   category: 'Combustible tractomula' },
  { keywords: ['llanta'],                                                         category: 'Llantas' },
  { keywords: ['engrase'],                                                        category: 'Engrase y lubricación' },
  { keywords: ['lavada', 'lavado'],                                              category: 'Lavada vehículo' },
  { keywords: ['parqueadero'],                                                    category: 'Parqueadero operación' },
]

export function categorizarPorReglas(descripcion: string): string | null {
  const normed = normalizarDescripcion(descripcion)
  for (const rule of RULES) {
    if (rule.keywords.some(k => normed.includes(k))) {
      return rule.category
    }
  }
  return null
}

export type ProveedorMatch = {
  category: { id: string; name: string; type: string }
  supplier_name: string
  match_type: 'PROVEEDOR'
}

/**
 * Looks up supplier_catalog entries that have keywords set and matches them
 * against the normalised description. Returns the first match with its
 * linked transaction_category (via cuenta_puc), or null if nothing matched.
 *
 * @param supabase — the Supabase client (passed in so this file stays importable
 *                   in both server and client contexts without bundling the client)
 */
export async function buscarPorProveedor(
  descripcion: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ProveedorMatch | null> {
  const normed = normalizarDescripcion(descripcion)

  const { data: catalog } = await supabase
    .from('supplier_catalog')
    .select('nombre, keywords, cuenta_puc')
    .not('keywords', 'is', null)
    .not('cuenta_puc', 'is', null)

  if (!catalog?.length) return null

  let matched: { nombre: string; cuenta_puc: string } | null = null
  for (const entry of catalog) {
    const kws = (entry.keywords as string[]) ?? []
    if (kws.length === 0) continue
    if (kws.some(kw => normed.includes(normalizarDescripcion(kw)))) {
      matched = { nombre: entry.nombre as string, cuenta_puc: entry.cuenta_puc as string }
      break
    }
  }

  if (!matched) return null

  const { data: cat } = await supabase
    .from('transaction_categories')
    .select('id, name, type')
    .eq('puc_code', matched.cuenta_puc)
    .eq('active', true)
    .maybeSingle()

  if (!cat) return null

  return {
    category:      { id: cat.id, name: cat.name, type: cat.type },
    supplier_name: matched.nombre,
    match_type:    'PROVEEDOR',
  }
}
