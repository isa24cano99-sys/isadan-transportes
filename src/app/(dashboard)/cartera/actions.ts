'use server'

/*
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
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function cruzarAnticiposAction(): Promise<{
  ok: boolean; created: number; message?: string; error?: string
}> {
  // 1. All EMITIDA invoices
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, issue_date, client_name, client_nit')
    .eq('invoice_type', 'EMITIDA')
    .order('issue_date')

  if (invErr) return { ok: false, created: 0, error: invErr.message }

  // 2. Already-imported invoice IDs
  const { data: existing, error: existErr } = await supabase
    .from('accounts_receivable_entries')
    .select('invoice_id')

  if (existErr?.code === '42P01') {
    return { ok: false, created: 0, error: 'Tabla no existe. Ejecuta el SQL del archivo actions.ts en Supabase.' }
  }

  const existingIds = new Set((existing ?? []).map((e: any) => e.invoice_id).filter(Boolean))
  const newInvoices = (invoices ?? []).filter((inv: any) => !existingIds.has(inv.id))

  if (newInvoices.length === 0) {
    return { ok: true, created: 0, message: 'Todas las facturas ya están importadas.' }
  }

  // 3. Anticipos from bank_transactions (category 28050510, direct or via category_id)
  const { data: catRows } = await supabase
    .from('transaction_categories')
    .select('id')
    .eq('puc_code', '28050510')

  const catIds = (catRows ?? []).map((c: any) => c.id)

  const [directRes, catIdRes] = await Promise.all([
    supabase
      .from('bank_transactions')
      .select('id, amount, description')
      .eq('type', 'INGRESO')
      .eq('category', '28050510'),
    catIds.length > 0
      ? supabase
          .from('bank_transactions')
          .select('id, amount, description')
          .eq('type', 'INGRESO')
          .in('category_id', catIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const seenTx = new Set<string>()
  const anticipos = [
    ...(directRes.data ?? []),
    ...((catIdRes.data ?? []) as any[]),
  ].filter((tx: any) => {
    if (seenTx.has(tx.id)) return false
    seenTx.add(tx.id)
    return true
  })

  // 4. Build anticipos map: nit → total (extract NIT from description)
  const anticiposByNit = new Map<string, number>()
  for (const ant of anticipos) {
    if (!ant.description) continue
    // Colombian NITs: 9-10 digit numbers, optionally followed by dash + check digit
    const nitMatch = ant.description.match(/\b(\d{9,10})(?:-\d)?\b/)
    if (nitMatch) {
      const nit = nitMatch[1]
      anticiposByNit.set(nit, (anticiposByNit.get(nit) ?? 0) + Number(ant.amount))
    }
  }

  // 5. Client lookup: nit → client_id
  const { data: clients } = await supabase
    .from('clients')
    .select('id, nit, name')

  const clientByNit = new Map<string, { id: string; name: string }>()
  for (const c of (clients ?? []) as any[]) {
    if (c.nit) clientByNit.set(c.nit, { id: c.id, name: c.name })
  }

  // 6. Group new invoices by client_nit and apply anticipos oldest-first
  const invoicesByNit = new Map<string, any[]>()
  for (const inv of newInvoices) {
    const nit = (inv as any).client_nit ?? 'SIN_NIT'
    if (!invoicesByNit.has(nit)) invoicesByNit.set(nit, [])
    invoicesByNit.get(nit)!.push(inv)
  }

  const entries: any[] = []
  for (const [nit, nitInvs] of invoicesByNit.entries()) {
    let available = anticiposByNit.get(nit) ?? 0
    const clientRec = clientByNit.get(nit)

    nitInvs.sort((a: any, b: any) => (a.issue_date ?? '').localeCompare(b.issue_date ?? ''))

    for (const inv of nitInvs) {
      const amount   = Number((inv as any).total_amount ?? 0)
      const applied  = Math.min(available, amount)
      available     -= applied
      const status   = applied >= amount ? 'PAGADA' : applied > 0 ? 'ABONADA' : 'PENDIENTE'

      entries.push({
        client_id:      clientRec?.id ?? null,
        client_name:    (inv as any).client_name ?? clientRec?.name ?? null,
        client_nit:     nit === 'SIN_NIT' ? null : nit,
        invoice_id:     (inv as any).id,
        invoice_number: (inv as any).invoice_number ?? null,
        invoice_amount: amount,
        invoice_date:   (inv as any).issue_date ?? null,
        advance_amount: applied,
        status,
      })
    }
  }

  if (entries.length === 0) return { ok: true, created: 0 }

  const { error: insErr } = await supabase
    .from('accounts_receivable_entries')
    .insert(entries)

  if (insErr) return { ok: false, created: 0, error: insErr.message }

  revalidatePath('/cartera')
  return { ok: true, created: entries.length }
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
