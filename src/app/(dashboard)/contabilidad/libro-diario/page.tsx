import { supabase } from '@/lib/supabase'
import { nombreTercero } from '@/lib/tercero-nombre'
import LibroDiarioClient, { type Asiento } from './LibroDiarioClient'

export const dynamic = 'force-dynamic'

const TIPO_NOMBRE: Record<string, string> = {
  CA: 'Ajuste/Apertura', CI: 'Causación Ingreso', CF: 'Facturación', RC: 'Recibo de Caja',
  CX: 'Cruce', CG: 'Costo/Gasto', CB: 'Pago Banco', CN: 'Nómina', CP: 'Provisión', CC: 'Cierre',
}

// Libro diario: todos los asientos CONTABILIZADO, cronológico por fecha (desempate por
// tipo+consecutivo). Un solo query con embeds (puc_accounts vía cuenta_puc, terceros vía
// tercero_id, header del asiento). Se agrupa por asiento en el server.
async function getLibroDiario(): Promise<Asiento[]> {
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(
      'debito, credito, centro_costo, cuenta_puc, journal_entry_id,' +
      'puc_accounts(nombre),' +
      'terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),' +
      'journal_entries!inner(tipo_comprobante, consecutivo, fecha, descripcion, estado)',
    )
    .eq('journal_entries.estado', 'CONTABILIZADO')

  const byEntry = new Map<string, Asiento>()
  for (const l of (lines ?? []) as any[]) {
    const e = l.journal_entries
    let a = byEntry.get(l.journal_entry_id)
    if (!a) {
      a = {
        id: l.journal_entry_id,
        tipo: e.tipo_comprobante,
        consecutivo: e.consecutivo,
        comprobante: `${e.tipo_comprobante}-${e.consecutivo}`,
        fecha: e.fecha,
        descripcion: e.descripcion ?? '',
        lineas: [],
        totalDebito: 0,
        totalCredito: 0,
      }
      byEntry.set(l.journal_entry_id, a)
    }
    const debito = Number(l.debito) || 0
    const credito = Number(l.credito) || 0
    a.lineas.push({
      cuenta: l.cuenta_puc,
      cuentaNombre: l.puc_accounts?.nombre ?? '',
      tercero: l.terceros ? nombreTercero(l.terceros) : null,
      centroCosto: l.centro_costo ?? null,
      debito,
      credito,
    })
    a.totalDebito += debito
    a.totalCredito += credito
  }

  const asientos = [...byEntry.values()]
  // dentro de cada asiento: débitos primero, luego créditos (presentación de diario)
  for (const a of asientos) a.lineas.sort((x, y) => (x.credito > 0 ? 1 : 0) - (y.credito > 0 ? 1 : 0))
  // cronológico por fecha; desempate por tipo, luego consecutivo (determinístico)
  asientos.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo) || a.consecutivo - b.consecutivo)
  return asientos
}

export default async function LibroDiarioPage() {
  const asientos = await getLibroDiario()
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Libro diario</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Todos los asientos contabilizados en orden cronológico. Cada bloque es un asiento con sus
          líneas y su cuadre. Es la fuente para reconstruir qué pasó en una fecha.
        </p>
      </div>
      <LibroDiarioClient asientos={asientos} tipoNombre={TIPO_NOMBRE} />
    </div>
  )
}
