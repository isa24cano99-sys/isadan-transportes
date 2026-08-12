import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import ExogenaConsultaClient, { type FilaExogena } from './ExogenaConsultaClient'

export const dynamic = 'force-dynamic'

// Reporte de CONSULTA para exógena (NO genera formato oficial ni XML). Lista el detalle
// por tercero de las líneas contabilizadas cuyo concepto_exogena — leído EN VIVO desde
// puc_accounts, no del snapshot de la línea — es 1001 (pagos) o 2276 (rentas de trabajo).
// Excluye la apertura (CA): un saldo inicial no es un movimiento del período. El resto de
// la información (ingresos, cartera, anticipos) ya vive en el balance/mayor, por eso esas
// cuentas quedaron en concepto NULL y no aparecen aquí.

const CONCEPTOS = ['1001', '2276']

async function getFilas(): Promise<FilaExogena[]> {
  // 1) líneas con concepto vivo 1001/2276, contabilizadas, sin apertura
  const lineas = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select(
      'debito, credito, cuenta_puc, tercero_id,' +
      'puc_accounts!inner(nombre, concepto_exogena),' +
      'journal_entries!inner(tipo_comprobante, consecutivo, fecha, periodo, estado)',
    )
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .neq('journal_entries.tipo_comprobante', 'CA')
    .in('puc_accounts.concepto_exogena', CONCEPTOS)
    .order('id', { ascending: true }).range(from, to))

  const rows = lineas as any[]

  // 2) terceros por id (datos DIAN completos), en un solo fetch
  const ids = [...new Set(rows.map(r => r.tercero_id).filter(Boolean))]
  const terById = new Map<string, any>()
  if (ids.length) {
    const { data: ters } = await supabase
      .from('terceros')
      .select(
        'id, tipo_persona, tipo_documento, numero_identificacion, digito_verificacion,' +
        'razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido,' +
        'direccion, codigo_departamento, codigo_municipio, completo',
      )
      .in('id', ids)
    for (const t of (ters ?? []) as any[]) terById.set(t.id, t)
  }

  return rows.map(r => {
    const t = r.tercero_id ? terById.get(r.tercero_id) : null
    const je = r.journal_entries
    return {
      concepto:     r.puc_accounts?.concepto_exogena ?? '',
      cuenta:       r.cuenta_puc,
      cuentaNombre: r.puc_accounts?.nombre ?? '',
      comprobante:  `${je.tipo_comprobante}-${je.consecutivo}`,
      fecha:        je.fecha,
      periodo:      je.periodo,
      terceroNit:   t?.numero_identificacion ?? null,
      terceroDv:    t?.digito_verificacion ?? null,
      tipoDocumento: t?.tipo_documento ?? null,
      terceroNombre: t ? nombreTercero(t) : '(sin tercero)',
      direccion:    t?.direccion ?? null,
      depto:        t?.codigo_departamento ?? null,
      municipio:    t?.codigo_municipio ?? null,
      completo:     t ? t.completo === true : false,
      debito:       Number(r.debito) || 0,
      credito:      Number(r.credito) || 0,
    }
  })
}

export default async function ExogenaConsultaPage() {
  const filas = await getFilas()
  const periodos = [...new Set(filas.map(f => f.periodo))].sort((a, b) => b.localeCompare(a))
  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Exógena — consulta</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Detalle por tercero de pagos (concepto 1001) y rentas de trabajo (concepto 2276)
          para armar la información exógena. <strong>Es un reporte de consulta</strong> — no genera
          el XML ni valida contra el prevalidador de la DIAN. Exportable a CSV como insumo del contador.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1">
          El concepto se lee en vivo desde el plan de cuentas. Excluye la apertura. Ingresos,
          cartera y anticipos no salen aquí — su saldo ya está en el balance de comprobación.
        </p>
      </div>
      <ExogenaConsultaClient filas={filas} periodos={periodos} />
    </div>
  )
}
