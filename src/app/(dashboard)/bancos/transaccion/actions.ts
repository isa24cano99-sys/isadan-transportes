'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { extraerPatron } from '@/lib/transaction-categorizer'

/**
 * Devuelve la etiqueta (CB-N/CG-N) del asiento CONTABILIZADO que tiene esta transacción
 * bancaria como origen, o null si no hay ninguno. Cubre los dos mecanismos por los que una
 * fila de banco queda amarrada a la contabilidad:
 *   (a) asiento posteado directamente desde la transacción (origen_tabla='bank_transactions')
 *       — p.ej. pago a proveedor (CB) o cualquier costo/gasto por banco;
 *   (b) FE vinculada (matched_invoice_id): el CG se posteó desde la factura DIAN.
 * Se usa para bloquear el borrado y el cambio de monto/fecha: mutar la fila DESPUÉS de postear
 * deja el asiento (inmutable) divergiendo en silencio — fue el hueco que causó la divergencia
 * de $469.900 en 220501·F2X (CB posteado, luego su bank_transaction editada/borrada).
 */
async function asientoContabilizadoDeTransaccion(id: string): Promise<string | null> {
  // (a) posteado directamente desde la transacción (el más común: pago a proveedor)
  const { data: directo } = await supabase
    .from('journal_entries')
    .select('tipo_comprobante, consecutivo')
    .eq('origen_tabla', 'bank_transactions')
    .eq('origen_id', id)
    .eq('estado', 'CONTABILIZADO')
    .order('created_at', { ascending: true }) // nombra el original, no la reversión posterior
    .limit(1)
    .maybeSingle()
  if (directo) return `${directo.tipo_comprobante}-${directo.consecutivo}`

  // (a2) dentro de un asiento CONSOLIDADO: no usa origen_id, la transacción vive en la
  //      tabla puente gasto_consolidado_items apuntando al CB del grupo.
  const { data: consol } = await supabase
    .from('gasto_consolidado_items')
    .select('journal_entries!inner(tipo_comprobante, consecutivo, estado)')
    .eq('bank_transaction_id', id)
    .eq('journal_entries.estado', 'CONTABILIZADO')
    .limit(1)
    .maybeSingle()
  const je = (consol as any)?.journal_entries
  if (je) return `${je.tipo_comprobante}-${je.consecutivo}`

  // (b) FE vinculada: el CG se posteó desde la factura, no desde la fila de banco
  const { data: t } = await supabase.from('bank_transactions').select('matched_invoice_id').eq('id', id).maybeSingle()
  if (t?.matched_invoice_id) {
    const { data: cg } = await supabase
      .from('journal_entries')
      .select('tipo_comprobante, consecutivo')
      .eq('origen_tabla', 'dian_invoices_import')
      .eq('origen_id', t.matched_invoice_id)
      .eq('estado', 'CONTABILIZADO')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return cg ? `${cg.tipo_comprobante}-${cg.consecutivo}` : 'un asiento contabilizado (FE vinculada)'
  }
  return null
}

/** Devuelve el cliente (nombre + NIT + tercero_id) del viaje, para sugerir el tercero. */
export async function obtenerClienteViajeAction(
  tripId: string,
): Promise<{ nit: string | null; name: string | null; terceroId: string | null } | null> {
  if (!tripId) return null
  const { data } = await supabase
    .from('trips')
    .select('clients(name, nit, tercero_id)')
    .eq('id', tripId)
    .single()
  const c = (data as any)?.clients
  if (!c || (!c.name && !c.nit)) return null
  return { nit: c.nit ?? null, name: c.name ?? null, terceroId: c.tercero_id ?? null }
}

function extractTxnFields(formData: FormData) {
  return {
    type:           formData.get('type') as string,
    amount:         Number(formData.get('amount')),
    date:           formData.get('date') as string,
    category_id:    (formData.get('category_id') as string) || null,
    description:    formData.get('description') as string,
    reference_type: (formData.get('reference_type') as string) || null,
    reference_id:   (formData.get('reference_id') as string) || null,
    supplier_nit:   (formData.get('supplier_nit') as string) || null,
    supplier_name:  (formData.get('supplier_name') as string) || null,
    // tercero_id: el que el usuario eligió en el selector (respeta la elección exacta,
    // no se re-resuelve por NIT en el backend). '' → null (no se eligió tercero).
    tercero_id:     (formData.get('tercero_id') as string) || null,
  }
}

export async function crearTransaccionAction(formData: FormData) {
  console.log('FormData recibido:', {
    category_id: formData.get('category_id'),
    category:    formData.get('category'),
    description: formData.get('description'),
    amount:      formData.get('amount'),
  })

  const data = {
    account_id: formData.get('account_id') as string,
    ...extractTxnFields(formData),
  }
  console.log('Datos a insertar en bank_transactions:', data)

  const { data: created, error } = await supabase.from('bank_transactions').insert(data).select().single()
  if (error) {
    console.error('Error insertando bank_transactions:', error.message, error.details)
    return { ok: false, error: error.message }
  }
  revalidatePath('/bancos')
  return { ok: true, data: created }
}

export async function actualizarTransaccionAction(id: string, formData: FormData) {
  const fields = extractTxnFields(formData)

  // Guard de inmutabilidad contable: si la transacción ya es origen de un asiento
  // CONTABILIZADO, no se puede cambiar el MONTO ni la FECHA (los campos que determinan el
  // débito/crédito y el periodo del asiento). Los demás campos (descripción, categoría,
  // tercero) NO afectan el asiento ya generado y siguen editables.
  const { data: actual } = await supabase.from('bank_transactions').select('amount, date').eq('id', id).maybeSingle()
  const cambiaMonto = actual != null && Number(actual.amount) !== fields.amount
  const cambiaFecha = actual != null && String(actual.date) !== String(fields.date)
  if (cambiaMonto || cambiaFecha) {
    const asiento = await asientoContabilizadoDeTransaccion(id)
    if (asiento) {
      return {
        ok: false,
        error: `No se puede cambiar el monto ni la fecha: esta transacción es el origen del asiento contabilizado ${asiento}. Reversa ese asiento primero (asiento de reversión con anula_a). Los demás campos (descripción, categoría, tercero) sí puedes editarlos.`,
      }
    }
  }

  const { error } = await supabase
    .from('bank_transactions')
    .update(fields)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Aprender el patrón si el usuario asignó una categoría manualmente
  if (fields.category_id && fields.description) {
    const pattern = extraerPatron(fields.description)
    if (pattern.length > 2) {
      const { data: existing } = await supabase
        .from('description_patterns')
        .select('id, match_count')
        .eq('pattern', pattern)
        .maybeSingle()

      if (existing) {
        const patternUpdate: Record<string, unknown> = {
          match_count: existing.match_count + 1,
          category_id: fields.category_id,
          updated_at:  new Date().toISOString(),
        }
        if (fields.supplier_nit) {
          patternUpdate.supplier_nit  = fields.supplier_nit
          patternUpdate.supplier_name = fields.supplier_name
        }
        await supabase.from('description_patterns').update(patternUpdate).eq('id', existing.id)
      } else {
        const patternInsert: Record<string, unknown> = { pattern, category_id: fields.category_id }
        if (fields.supplier_nit) {
          patternInsert.supplier_nit  = fields.supplier_nit
          patternInsert.supplier_name = fields.supplier_name
        }
        await supabase.from('description_patterns').insert(patternInsert)
      }
    }
  }

  revalidatePath('/bancos', 'layout')
  return { ok: true }
}

export async function eliminarTransaccionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  // Guard de inmutabilidad: una transacción que ya es origen de un asiento CONTABILIZADO no se
  // borra (dejaría el asiento inmutable sin su contraparte bancaria, divergiendo en silencio).
  // Cubre pago a proveedor (CB), FE vinculada y cualquier otro asiento por banco. Exige reversar primero.
  const asiento = await asientoContabilizadoDeTransaccion(id)
  if (asiento) {
    return {
      ok: false,
      error: `No se puede borrar: esta transacción es el origen del asiento contabilizado ${asiento}. Reversa ese asiento primero (asiento de reversión con anula_a) y vuelve a intentarlo.`,
    }
  }
  const { error } = await supabase.from('bank_transactions').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos', 'layout')
  return { ok: true }
}

export async function asignarCategoriaMasivaAction(
  ids: string[],
  categoryId: string,
): Promise<{ ok: boolean; error?: string; updated: number }> {
  if (!ids.length || !categoryId) return { ok: false, error: 'Datos incompletos', updated: 0 }

  const { data: txns } = await supabase
    .from('bank_transactions')
    .select('id, description')
    .in('id', ids)

  const { error } = await supabase
    .from('bank_transactions')
    .update({ category_id: categoryId })
    .in('id', ids)

  if (error) return { ok: false, error: error.message, updated: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patternUpdates: any[] = []
  for (const tx of (txns ?? [])) {
    if (!tx.description) continue
    const pattern = extraerPatron(tx.description)
    if (pattern.length <= 2) continue
    const { data: existing } = await supabase
      .from('description_patterns')
      .select('id, match_count')
      .eq('pattern', pattern)
      .maybeSingle()
    if (existing) {
      patternUpdates.push(
        supabase.from('description_patterns').update({
          match_count: existing.match_count + 1,
          category_id: categoryId,
          updated_at:  new Date().toISOString(),
        }).eq('id', existing.id),
      )
    } else {
      patternUpdates.push(
        supabase.from('description_patterns').insert({ pattern, category_id: categoryId }),
      )
    }
  }
  await Promise.all(patternUpdates)

  revalidatePath('/bancos', 'layout')
  return { ok: true, updated: ids.length }
}

/**
 * Asigna un tercero (proveedor/cliente) a varias transacciones de golpe:
 * un solo UPDATE sobre bank_transactions para todos los IDs.
 */
export async function asignarProveedorMasivoAction(
  ids: string[],
  supplierNit: string | null,
  supplierName: string,
  terceroId: string | null = null,
): Promise<{ ok: boolean; error?: string; updated: number }> {
  if (!ids.length || !supplierName?.trim()) return { ok: false, error: 'Datos incompletos', updated: 0 }

  const { error } = await supabase
    .from('bank_transactions')
    .update({ supplier_nit: supplierNit?.trim() || null, supplier_name: supplierName.trim(), tercero_id: terceroId })
    .in('id', ids)

  if (error) return { ok: false, error: error.message, updated: 0 }

  revalidatePath('/bancos', 'layout')
  return { ok: true, updated: ids.length }
}
