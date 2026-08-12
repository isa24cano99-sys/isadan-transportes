import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import RecibosClient from './RecibosClient'

export const dynamic = 'force-dynamic'

// Elegibles = movimientos bancarios categorizados "Anticipo de cliente" (puc 28050510),
// tipo INGRESO, con tercero es_cliente, desde 2026-07-01 (corte apertura: los anticipos
// pre-corte ya están en el saldo de 28050510 del asiento de apertura → registrarlos
// duplicaría), y que aún NO tienen recibo RC contabilizado.
async function getAnticipos() {
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '28050510').limit(1).maybeSingle()
  if (!cat) return []

  const { data: rc } = await supabase
    .from('journal_entries').select('origen_id')
    .eq('origen_tabla', 'bank_transactions').eq('tipo_comprobante', 'RC').eq('estado', 'CONTABILIZADO')
  const conRC = new Set((rc ?? []).map(x => x.origen_id))

  const bts = await fetchAll<any>((from, to) => supabase
    .from('bank_transactions')
    .select('id, date, amount, description, tercero_id, terceros(razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona, es_cliente)')
    .eq('category_id', cat.id)
    .eq('type', 'INGRESO')
    .gte('date', '2026-07-01')
    .order('date').order('id', { ascending: true }).range(from, to))

  return bts
    .filter((b: any) => b.tercero_id && b.terceros?.es_cliente && !conRC.has(b.id))
    .map((b: any) => ({
      id:          b.id,
      fecha:       b.date as string,
      monto:       Number(b.amount),
      cliente:     b.terceros ? nombreTercero(b.terceros) : '—',
      descripcion: (b.description ?? '') as string,
    }))
}

export default async function RecibosPage() {
  const movimientos = await getAnticipos()
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Recibos de anticipo</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Consignaciones desde julio 2026 categorizadas como &ldquo;Anticipo de cliente&rdquo;, pendientes de registrar
          (DB 11100510 Banco / CR 28050510 Anticipo clientes). Nada se contabiliza sin tu confirmación.
        </p>
        <p className="text-xs text-[#94A3B8] mt-1.5">
          Revisa la descripción del banco antes de confirmar — tú eres el criterio final de si de verdad es un anticipo.
          Estos anticipos se cruzan luego contra cartera (evento 4).
        </p>
      </div>
      <RecibosClient movimientos={movimientos} />
    </div>
  )
}
