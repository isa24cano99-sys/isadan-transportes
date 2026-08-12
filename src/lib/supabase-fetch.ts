// Paginación robusta para consultas Supabase/PostgREST.
//
// PostgREST corta CUALQUIER `.select(...)` en 1000 filas por defecto. Una consulta sin
// `.range()`/`.limit()` sobre una tabla con >1000 filas devuelve solo las primeras 1000
// SILENCIOSAMENTE — sin error — corrompiendo cualquier suma/saldo que se calcule encima.
// (Fue exactamente el bug del módulo Bancos cuando bank_transactions pasó de 1000.)
//
// `fetchAll` trae TODAS las filas paginando de a `pageSize`. El callback recibe el rango
// [from, to] y debe aplicarlo con `.range(from, to)` sobre la consulta.
//
//   const filas = await fetchAll((from, to) =>
//     supabase.from('bank_transactions').select('*').eq('account_id', id)
//       .order('id', { ascending: true }).range(from, to))
//
// Importante: ordena por una columna determinística (idealmente única, p.ej. `id`) para que
// la paginación sea estable entre lotes; si el orden no es determinístico, una fila en el
// borde de página podría duplicarse u omitirse.
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}
