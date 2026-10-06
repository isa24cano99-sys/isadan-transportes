'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type CierreResultado = { ok: boolean; mensaje: string }

/**
 * Cierra un periodo: lo BLOQUEA y corre las reclasificaciones de presentación (saldos
 * débito 220501 → 133005). NO cancela clases 4-6 contra resultados — el cierre de
 * RESULTADOS es anual (31-dic), no mensual. La función rechaza si el periodo ya está CERRADO.
 */
export async function cerrarPeriodoAction(periodo: string): Promise<CierreResultado> {
  const { error } = await supabase.rpc('postear_cierre_periodo', { p_periodo: `${periodo}-01` })
  if (error) return { ok: false, mensaje: error.message }
  revalidatePath('/contabilidad/cierre-periodo')
  return { ok: true, mensaje: `Periodo ${periodo} bloqueado; el cierre de resultados es anual (no mensual).` }
}

/**
 * Reabre un periodo: SOLO cambia el estado a ABIERTO (quita el candado). El asiento
 * de cierre CC NO se toca — sigue en el libro. Para deshacerlo de verdad hace falta
 * una reversión explícita (regla de inmutabilidad). Reabrir + volver a postear en el
 * mes convive con el CC viejo, así que normalmente se reabre para corregir y luego se
 * anula el CC con reversión antes de re-cerrar.
 */
export async function reabrirPeriodoAction(periodo: string): Promise<CierreResultado> {
  const { error } = await supabase
    .from('periodos_contables').update({ estado: 'ABIERTO', fecha_cierre: null }).eq('periodo', periodo)
  if (error) return { ok: false, mensaje: error.message }
  revalidatePath('/contabilidad/cierre-periodo')
  return { ok: true, mensaje: `Periodo ${periodo} reabierto. El asiento de cierre CC sigue en el libro — anúlalo con una reversión si vas a re-cerrar.` }
}
