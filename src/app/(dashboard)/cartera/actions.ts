'use server'

/*
⚠ HISTÓRICO — la fuente de verdad del esquema es supabase/migrations/ (ver README → Migraciones).
   Este bloque se conserva solo como referencia de cómo se crearon estas tablas; NO ejecutar a mano.

Run this SQL in Supabase before using this module:

create table if not exists accounts_receivable_entries (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id),
  client_name text,
  client_nit text,
  invoice_id uuid references invoices(id),
  invoice_number text,
  invoice_amount numeric(14,2) default 0,
  invoice_date date,
  advance_amount numeric(14,2) default 0,
  balance numeric(14,2) generated always as (invoice_amount - advance_amount) stored,
  status text default 'PENDIENTE' check (status in ('PENDIENTE','PAGADA','ABONADA')),
  paid_date date,
  notes text,
  created_at timestamptz default now()
);
alter table accounts_receivable_entries disable row level security;
grant all on accounts_receivable_entries to service_role;

-- Historial de pagos (un pago puede cubrir varias facturas):
create table if not exists client_payments (
  id uuid primary key default uuid_generate_v4(),
  client_nit text, client_name text,
  amount numeric(14,2) not null,
  payment_date date not null,
  description text,
  covered_invoices text[] default '{}',   -- números FEIT cubiertos
  saldo_a_favor numeric(14,2) default 0,
  bank_transaction_id uuid,
  created_at timestamptz default now()
);
alter table client_payments disable row level security;
grant all on client_payments to service_role;
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

/**
 * IMPORT PURO de cartera (no cruza nada). Crea accounts_receivable_entries para las
 * facturas EMITIDA (no ANULADA) que aún no tienen entry, con:
 *   · tercero_id resuelto (de invoices.tercero_id o, si es NULL, por client_nit → terceros),
 *   · advance_amount = 0, status = 'PENDIENTE'.
 *
 * El cruce de anticipos NO se hace aquí: es un evento contable (evento 4,
 * postear_cruce_cartera_v2) que postea un CX en el libro y sincroniza advance_amount
 * de forma atómica. Tener un segundo mecanismo de cruce (el viejo, por NIT-en-texto)
 * hacía divergir la cartera operativa de la contable — se eliminó. Una factura sin
 * tercero resoluble NO se crea (rompería el evento 4); se reporta y se omite.
 */
export async function importarCarteraAction(): Promise<{
  ok: boolean; created: number; message?: string; error?: string
}> {
  // 1. Facturas EMITIDA (con estado DIAN y tercero_id)
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, issue_date, client_name, client_nit, tercero_id, dian_status')
    .eq('invoice_type', 'EMITIDA')
    .order('issue_date')

  if (invErr) return { ok: false, created: 0, error: invErr.message }

  // 2. IDs ya importados
  const { data: existing, error: existErr } = await supabase
    .from('accounts_receivable_entries')
    .select('invoice_id')

  if (existErr?.code === '42P01') {
    return { ok: false, created: 0, error: 'Tabla no existe. Ejecuta el SQL del archivo actions.ts en Supabase.' }
  }

  const existingIds = new Set((existing ?? []).map((e: any) => e.invoice_id).filter(Boolean))

  // 3. Nuevas = EMITIDA, NO ANULADA, sin entry aún (una cartera no se apoya en documento anulado)
  const newInvoices = (invoices ?? []).filter(
    (inv: any) => !existingIds.has(inv.id) && inv.dian_status !== 'ANULADA',
  )
  if (newInvoices.length === 0) {
    return { ok: true, created: 0, message: 'No hay facturas nuevas para importar.' }
  }

  // 4. Resolver tercero_id faltante por client_nit → terceros (no-merged)
  const missingNits = [...new Set(
    newInvoices.filter((i: any) => !i.tercero_id && i.client_nit).map((i: any) => i.client_nit as string),
  )]
  const terceroByNit = new Map<string, string>()
  if (missingNits.length > 0) {
    const { data: ters } = await supabase
      .from('terceros')
      .select('id, numero_identificacion')
      .in('numero_identificacion', missingNits)
      .is('merged_into', null)
    for (const t of (ters ?? []) as any[]) terceroByNit.set(t.numero_identificacion, t.id)
  }

  // 5. client_id best-effort por nit (mantiene el campo poblado como las entries previas)
  const { data: clients } = await supabase.from('clients').select('id, nit')
  const clientByNit = new Map<string, string>()
  for (const c of (clients ?? []) as any[]) if (c.nit) clientByNit.set(c.nit, c.id)

  // 6. Construir entries (import puro): advance 0, PENDIENTE, tercero_id obligatorio
  const entries: any[] = []
  const omitidas: string[] = []
  for (const inv of newInvoices as any[]) {
    const terceroId = inv.tercero_id ?? (inv.client_nit ? terceroByNit.get(inv.client_nit) : null) ?? null
    if (!terceroId) { omitidas.push(inv.invoice_number ?? inv.id); continue }
    entries.push({
      client_id:      inv.client_nit ? clientByNit.get(inv.client_nit) ?? null : null,
      client_name:    inv.client_name ?? null,
      client_nit:     inv.client_nit ?? null,
      invoice_id:     inv.id,
      invoice_number: inv.invoice_number ?? null,
      invoice_amount: Number(inv.total_amount ?? 0),
      invoice_date:   inv.issue_date ?? null,
      advance_amount: 0,
      status:         'PENDIENTE',
      tercero_id:     terceroId,
    })
  }

  const omitMsg = omitidas.length ? ` · ${omitidas.length} sin tercero resoluble, omitida(s): ${omitidas.join(', ')}` : ''

  if (entries.length === 0) {
    return { ok: true, created: 0, message: `Sin facturas para importar${omitMsg}` }
  }

  const { error: insErr } = await supabase
    .from('accounts_receivable_entries')
    .insert(entries)

  if (insErr) return { ok: false, created: 0, error: insErr.message }

  revalidatePath('/cartera')
  return { ok: true, created: entries.length, message: `${entries.length} factura(s) importada(s)${omitMsg}` }
}

export async function marcarPagadaAction(
  entryId: string,
  paidDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: entry, error: fetchErr } = await supabase
    .from('accounts_receivable_entries')
    .select('invoice_amount')
    .eq('id', entryId)
    .single()

  if (fetchErr || !entry) return { ok: false, error: fetchErr?.message ?? 'No encontrada' }

  const { error } = await supabase
    .from('accounts_receivable_entries')
    .update({
      status:         'PAGADA',
      paid_date:      paidDate,
      advance_amount: (entry as any).invoice_amount, // balance → 0
    })
    .eq('id', entryId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/cartera')
  return { ok: true }
}

export async function aplicarAbonoAction(
  entryId: string,
  monto: number,
): Promise<{ ok: boolean; error?: string }> {
  const { data: entry, error: fetchErr } = await supabase
    .from('accounts_receivable_entries')
    .select('invoice_amount, advance_amount')
    .eq('id', entryId)
    .single()

  if (fetchErr || !entry) return { ok: false, error: fetchErr?.message ?? 'No encontrada' }

  const invAmt    = Number((entry as any).invoice_amount)
  const newAdv    = Math.min(invAmt, Number((entry as any).advance_amount) + monto)
  const newStatus = newAdv >= invAmt ? 'PAGADA' : 'ABONADA'

  const { error } = await supabase
    .from('accounts_receivable_entries')
    .update({ advance_amount: newAdv, status: newStatus })
    .eq('id', entryId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/cartera')
  return { ok: true }
}

export async function eliminarEntradaAction(
  entryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('accounts_receivable_entries')
    .delete()
    .eq('id', entryId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/cartera')
  return { ok: true }
}

export type ClientPayment = {
  id: string
  amount: number
  payment_date: string
  description: string | null
  covered_invoices: string[]
  saldo_a_favor: number
  created_at: string
}

/**
 * Registra un pago del cliente que cubre varias facturas de una sola transferencia.
 * Aplica el monto en cascada (oldest-first) a las entries seleccionadas, marca cada
 * una PAGADA/ABONADA, registra el INGRESO en bank_transactions (categoría 28050510)
 * y guarda el pago en client_payments (con el saldo a favor si el pago sobra).
 */
export async function registrarPagoMultipleAction(params: {
  clientNit:   string | null
  clientName:  string
  amount:      number
  paymentDate: string
  description: string
  entryIds:    string[]
}): Promise<{ ok: boolean; error?: string; pagadas?: number; abonadas?: number; saldoAFavor?: number }> {
  const { clientNit, clientName, amount, paymentDate, description, entryIds } = params

  if (!amount || amount <= 0)  return { ok: false, error: 'Ingresa un monto de pago válido.' }
  if (!paymentDate)            return { ok: false, error: 'Selecciona la fecha del pago.' }
  if (!entryIds?.length)       return { ok: false, error: 'Selecciona al menos una factura.' }

  // 1. Entries seleccionadas
  const { data: entries, error: entErr } = await supabase
    .from('accounts_receivable_entries')
    .select('id, invoice_number, invoice_amount, invoice_date, advance_amount, balance, status')
    .in('id', entryIds)
  if (entErr) { console.error('[registrarPago] entries:', entErr.message); return { ok: false, error: entErr.message } }
  if (!entries?.length) return { ok: false, error: 'No se encontraron las facturas seleccionadas.' }

  // 2. Aplicar el pago (plata del cliente) en cascada, oldest-first
  const sorted = [...entries].sort((a: any, b: any) => (a.invoice_date ?? '').localeCompare(b.invoice_date ?? ''))
  let remaining = amount
  let pagadas = 0, abonadas = 0
  for (const e of sorted as any[]) {
    if (remaining <= 0) break
    const bal = Number(e.balance ?? 0)
    if (bal <= 0) continue
    const applied    = Math.min(remaining, bal)
    const newAdvance = Number(e.advance_amount ?? 0) + applied
    const fullyPaid  = newAdvance >= Number(e.invoice_amount ?? 0)
    const upd: Record<string, unknown> = {
      advance_amount: newAdvance,
      status:         fullyPaid ? 'PAGADA' : 'ABONADA',
    }
    if (fullyPaid) upd.paid_date = paymentDate
    const { error: updErr } = await supabase.from('accounts_receivable_entries').update(upd).eq('id', e.id)
    if (updErr) { console.error('[registrarPago] update entry:', updErr.message); return { ok: false, error: updErr.message } }
    remaining -= applied
    if (fullyPaid) pagadas++; else abonadas++
  }
  const saldoAFavor = Math.max(0, remaining)

  // 3. Cuenta destino + categoría 28050510 (Anticipo de cliente)
  const { data: accounts } = await supabase.from('bank_accounts').select('id, bank_name').order('bank_name')
  const account =
    (accounts ?? []).find(a => /bancolombia/i.test(a.bank_name ?? '') && /ahorro/i.test(a.bank_name ?? '')) ??
    (accounts ?? []).find(a => /ahorro/i.test(a.bank_name ?? '')) ??
    (accounts ?? [])[0]
  const { data: cat } = await supabase
    .from('transaction_categories').select('id').eq('puc_code', '28050510').maybeSingle()

  // 4. Ingreso en bancos (no fatal: si falla, las facturas ya se actualizaron)
  let bankTxId: string | null = null
  if (account) {
    const { data: bankRow, error: bankErr } = await supabase.from('bank_transactions').insert({
      account_id:  account.id,
      type:        'INGRESO',
      amount,
      date:        paymentDate,
      description: description || `Pago cartera ${clientName}`,
      category:    '28050510',
      category_id: cat?.id ?? null,
      source:      'PAGO_CARTERA',
    }).select('id').single()
    if (bankErr) console.error('[registrarPago] bank_transactions:', bankErr.message)
    else bankTxId = bankRow?.id ?? null
  } else {
    console.error('[registrarPago] no hay cuenta bancaria para registrar el ingreso')
  }

  // 5. Historial de pagos
  const coveredInvoices = (sorted as any[]).map(e => e.invoice_number).filter(Boolean)
  const { error: payErr } = await supabase.from('client_payments').insert({
    client_nit:          clientNit,
    client_name:         clientName,
    amount,
    payment_date:        paymentDate,
    description:         description || null,
    covered_invoices:    coveredInvoices,
    saldo_a_favor:       saldoAFavor,
    bank_transaction_id: bankTxId,
  })
  if (payErr) { console.error('[registrarPago] client_payments:', payErr.message); return { ok: false, error: payErr.message } }

  revalidatePath('/cartera')
  if (clientNit) revalidatePath(`/cartera/${encodeURIComponent(clientNit)}`)
  return { ok: true, pagadas, abonadas, saldoAFavor }
}
