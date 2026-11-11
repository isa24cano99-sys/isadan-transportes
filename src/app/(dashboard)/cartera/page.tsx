import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { nombreTercero } from '@/lib/tercero-nombre'
import { resumirCartera, type LineaCartera } from '@/lib/cartera-libro'
import CarteraClient from './CarteraClient'

export const dynamic = 'force-dynamic'

// Cartera = lo que dice el LIBRO sobre dos cuentas, por tercero:
//   · 28050510 Anticipos de clientes  (lo que el cliente ya pagó y aún no se aplica)
//   · 13050501 Cartera facturada      (lo facturado con FE pendiente de cobro)
// más cuánto se facturó cada mes. Nada se digita aquí: se contabiliza en Recibos de anticipo,
// Facturación y Cruce de cartera.
export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()

  const rows = await fetchAll<any>((from, to) => supabase
    .from('journal_entry_lines')
    .select(`
      cuenta_puc, debito, credito, tercero_id,
      terceros(numero_identificacion, razon_social, primer_nombre, otros_nombres, primer_apellido, segundo_apellido, tipo_persona),
      journal_entries!inner(estado, fecha, tipo_comprobante)
    `)
    .in('cuenta_puc', ['28050510', '13050501'])
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .order('id', { ascending: true }).range(from, to))

  const lineas: LineaCartera[] = rows
    .filter(r => r.journal_entries?.fecha)
    .map(r => {
      const t = Array.isArray(r.terceros) ? r.terceros[0] : r.terceros
      return {
        cuenta:    r.cuenta_puc as string,
        fecha:     r.journal_entries.fecha as string,
        tipo:      r.journal_entries.tipo_comprobante as string,
        debito:    Number(r.debito ?? 0),
        credito:   Number(r.credito ?? 0),
        terceroId: (r.tercero_id ?? null) as string | null,
        nombre:    t ? nombreTercero(t) : '',
        nit:       (t?.numero_identificacion ?? null) as string | null,
      }
    })

  const resumen = resumirCartera(year, lineas)

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 4 }, (_, i) => currentYear - i)

  return <CarteraClient year={year} availableYears={availableYears} resumen={resumen} />
}
