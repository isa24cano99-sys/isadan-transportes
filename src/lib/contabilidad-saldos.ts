import { supabase } from '@/lib/supabase'
import { nombreTercero } from '@/lib/tercero-nombre'

// Helper compartido por el balance de comprobación y el libro mayor. Trae todas las
// líneas de asientos CONTABILIZADO con su cuenta (nombre+naturaleza), tercero y header.
// Agregación en el server (JS) — sin vista SQL mientras el volumen sea bajo (ver el
// criterio del ~1.500 líneas documentado en la sesión). El día del trigger, esto se
// reemplaza por una vista `balance_comprobacion` sin tocar la UI.

export type LineaMov = {
  cuenta: string
  cuentaNombre: string
  naturaleza: string
  fecha: string
  tipo: string
  consecutivo: number
  comprobante: string
  descripcion: string
  tercero: string | null
  centroCosto: string | null
  debito: number
  credito: number
}

export async function fetchLineasContabilizadas(
  opts?: { periodo?: string; excluirCierre?: boolean },
): Promise<LineaMov[]> {
  let query = supabase
    .from('journal_entry_lines')
    .select(
      'debito, credito, centro_costo, cuenta_puc,' +
      'puc_accounts(nombre, naturaleza),' +
      'terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),' +
      'journal_entries!inner(tipo_comprobante, consecutivo, fecha, descripcion, estado, periodo)',
    )
    .eq('journal_entries.estado', 'CONTABILIZADO')

  if (opts?.periodo) query = query.eq('journal_entries.periodo', opts.periodo)
  if (opts?.excluirCierre) query = query.neq('journal_entries.tipo_comprobante', 'CC')

  const { data } = await query
  return ((data ?? []) as any[]).map(l => ({
    cuenta:       l.cuenta_puc,
    cuentaNombre: l.puc_accounts?.nombre ?? '',
    naturaleza:   l.puc_accounts?.naturaleza ?? '',
    fecha:        l.journal_entries.fecha,
    tipo:         l.journal_entries.tipo_comprobante,
    consecutivo:  l.journal_entries.consecutivo,
    comprobante:  `${l.journal_entries.tipo_comprobante}-${l.journal_entries.consecutivo}`,
    descripcion:  l.journal_entries.descripcion ?? '',
    tercero:      l.terceros ? nombreTercero(l.terceros) : null,
    centroCosto:  l.centro_costo ?? null,
    debito:       Number(l.debito) || 0,
    credito:      Number(l.credito) || 0,
  }))
}

// Saldo según naturaleza: débito neto para cuentas DEBITO, crédito neto para CREDITO.
export function saldoNaturaleza(naturaleza: string, sumDebito: number, sumCredito: number): number {
  return naturaleza === 'DEBITO' ? sumDebito - sumCredito : sumCredito - sumDebito
}

// ── Estados financieros ───────────────────────────────────────────────────────
// Clasificación por el PRIMER DÍGITO del código PUC (estructura canónica, no el
// campo `tipo`): 1 Activo · 2 Pasivo · 3 Patrimonio · 4 Ingreso · 5 Gasto · 6/7 Costo.
// El monto de presentación tiene signo natural del grupo (activo/costo/gasto = D−C;
// pasivo/patrimonio/ingreso = C−D), así un saldo anormal (banco sobregirado, patrimonio
// negativo) sale negativo y se muestra en rojo, sin esconderlo.

export type CuentaFin = { codigo: string; nombre: string; clase: string; subgrupo: string; monto: number }

export type EstructuraFin = {
  cuentas: CuentaFin[]
  activo: number; pasivo: number; patrimonio: number
  ingresos: number; costos: number; gastos: number; utilidad: number
}

// Subgrupos PUC (2 dígitos) — solo los que aparecen o pueden aparecer pronto.
export const SUBGRUPO: Record<string, string> = {
  '11': 'Disponible', '13': 'Deudores', '14': 'Inventarios', '15': 'Propiedad, planta y equipo',
  '22': 'Proveedores', '23': 'Cuentas por pagar', '24': 'Impuestos, gravámenes y tasas',
  '25': 'Obligaciones laborales', '28': 'Otros pasivos',
  '31': 'Capital social', '33': 'Reservas', '36': 'Resultados acumulados', '37': 'Resultados ejercicios anteriores',
  '41': 'Ingresos operacionales', '42': 'Ingresos no operacionales',
  '51': 'Gastos de administración', '52': 'Gastos de personal / ventas', '53': 'Gastos no operacionales',
  '61': 'Costo de ventas', '62': 'Compras', '73': 'Costos de producción',
}

export async function getEstructuraFinanciera(
  opts?: { periodo?: string; excluirCierre?: boolean },
): Promise<EstructuraFin> {
  const lineas = await fetchLineasContabilizadas(opts)
  const acc = new Map<string, { nombre: string; d: number; c: number }>()
  for (const l of lineas) {
    let a = acc.get(l.cuenta)
    if (!a) { a = { nombre: l.cuentaNombre, d: 0, c: 0 }; acc.set(l.cuenta, a) }
    a.d += l.debito
    a.c += l.credito
  }
  const cuentas: CuentaFin[] = [...acc.entries()].map(([codigo, v]) => {
    const clase = codigo.charAt(0)
    const debitNat = clase === '1' || clase === '5' || clase === '6' || clase === '7'
    return {
      codigo, nombre: v.nombre, clase, subgrupo: codigo.slice(0, 2),
      monto: debitNat ? v.d - v.c : v.c - v.d,
    }
  }).sort((x, y) => x.codigo.localeCompare(y.codigo))

  const sumClase = (...cl: string[]) => cuentas.filter(c => cl.includes(c.clase)).reduce((s, c) => s + c.monto, 0)
  const ingresos = sumClase('4')
  const costos = sumClase('6', '7')
  const gastos = sumClase('5')
  return {
    cuentas, ingresos, costos, gastos, utilidad: ingresos - costos - gastos,
    activo: sumClase('1'), pasivo: sumClase('2'), patrimonio: sumClase('3'),
  }
}

// Periodos (YYYY-MM) con actividad de RESULTADO (clase 4-7), excluyendo asientos de
// cierre (CC) — los meses que tienen algo que mostrar en el Estado de Resultados.
// Más recientes primero. (Meses con solo movimiento de balance no aparecen.)
export async function getPeriodosDisponibles(): Promise<string[]> {
  const { data } = await supabase
    .from('journal_entry_lines')
    .select('cuenta_puc, journal_entries!inner(periodo, estado, tipo_comprobante)')
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .neq('journal_entries.tipo_comprobante', 'CC')
  const set = new Set<string>()
  for (const l of (data ?? []) as any[]) {
    if (['4', '5', '6', '7'].includes(String(l.cuenta_puc).charAt(0))) set.add(l.journal_entries.periodo)
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

// Agrupa cuentas de las clases dadas por subgrupo (2 dígitos), con subtotal.
export function agruparPorSubgrupo(cuentas: CuentaFin[], clases: string[]) {
  const m = new Map<string, CuentaFin[]>()
  for (const c of cuentas.filter(c => clases.includes(c.clase))) {
    if (!m.has(c.subgrupo)) m.set(c.subgrupo, [])
    m.get(c.subgrupo)!.push(c)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subgrupo, cs]) => ({ subgrupo, label: SUBGRUPO[subgrupo] ?? subgrupo, cuentas: cs, subtotal: cs.reduce((s, c) => s + c.monto, 0) }))
}
