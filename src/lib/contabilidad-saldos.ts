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

export async function fetchLineasContabilizadas(): Promise<LineaMov[]> {
  const { data } = await supabase
    .from('journal_entry_lines')
    .select(
      'debito, credito, centro_costo, cuenta_puc,' +
      'puc_accounts(nombre, naturaleza),' +
      'terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),' +
      'journal_entries!inner(tipo_comprobante, consecutivo, fecha, descripcion, estado)',
    )
    .eq('journal_entries.estado', 'CONTABILIZADO')

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
