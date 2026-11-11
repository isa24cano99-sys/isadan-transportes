'use server'

/*
  ⚠ HISTÓRICO — la fuente de verdad del esquema es supabase/migrations/ (ver README → Migraciones).
     Se conserva solo como referencia; NO ejecutar a mano.

  SQL to run once in Supabase SQL Editor:

  create table if not exists payroll_social_security (
    id          uuid primary key default uuid_generate_v4(),
    year        integer not null,
    month       integer not null,
    driver_id   uuid not null references drivers(id),
    driver_name text,
    document    text,
    salary      numeric(14,2),
    days        integer not null default 30,
    ibc         numeric(14,2) not null default 0,
    pension     numeric(14,2) not null default 0,
    salud       numeric(14,2) not null default 0,
    ccf         numeric(14,2) not null default 0,
    arl         numeric(14,2) not null default 0,
    total       numeric(14,2) not null default 0,
    paid        boolean default false,
    paid_date   date,
    created_at  timestamptz default now(),
    unique(driver_id, year, month)
  );
  alter table payroll_social_security disable row level security;
  grant all on payroll_social_security to service_role;
*/

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type SegSocialRow = {
  driver_id:   string
  driver_name: string
  document:    string
  salary:      number
  days:        number
  ibc:         number
  pension:     number
  salud:       number
  ccf:         number
  arl:         number
  total:       number
}

export type PlanillaPagada = {
  paid:      boolean
  paid_date: string | null
  rows:      SegSocialRow[]
}

export async function getPlanillaSegSocialAction(
  year: number,
  month: number,
): Promise<{ ok: boolean; planilla: PlanillaPagada | null; error?: string }> {
  const { data, error } = await supabase
    .from('payroll_social_security')
    .select('*')
    .eq('year', year)
    .eq('month', month)

  if (error) {
    // Table doesn't exist yet — not an error, just no data
    if ((error as any).code === '42P01') return { ok: true, planilla: null }
    return { ok: false, planilla: null, error: error.message }
  }

  if (!data?.length) return { ok: true, planilla: null }

  const rows: SegSocialRow[] = data.map(r => ({
    driver_id:   r.driver_id,
    driver_name: r.driver_name  ?? '',
    document:    r.document     ?? '',
    salary:      Number(r.salary  ?? 0),
    days:        Number(r.days),
    ibc:         Number(r.ibc),
    pension:     Number(r.pension),
    salud:       Number(r.salud),
    ccf:         Number(r.ccf),
    arl:         Number(r.arl),
    total:       Number(r.total),
  }))

  const paid     = data.some(r => r.paid)
  const paid_date = data.find(r => r.paid_date)?.paid_date ?? null

  return { ok: true, planilla: { paid, paid_date, rows } }
}

export async function registrarPagoSegSocialAction(
  year:      number,
  month:     number,
  rows:      SegSocialRow[],
  accountId: string,
  paidDate:  string,
): Promise<{ ok: boolean; error?: string }> {
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  const upsertRows = rows.map(r => ({
    year,
    month,
    driver_id:   r.driver_id,
    driver_name: r.driver_name,
    document:    r.document,
    salary:      r.salary,
    days:        r.days,
    ibc:         r.ibc,
    pension:     r.pension,
    salud:       r.salud,
    ccf:         r.ccf,
    arl:         r.arl,
    total:       r.total,
    paid:        true,
    paid_date:   paidDate,
  }))

  const { error: upsertErr } = await supabase
    .from('payroll_social_security')
    .upsert(upsertRows, { onConflict: 'driver_id,year,month' })

  if (upsertErr) return { ok: false, error: upsertErr.message }

  // OJO: la planilla es solo informativa. Ya NO inserta egresos inventados en bank_transactions:
  // el pago real de la PILA viene del extracto y se contabiliza en la pestaña «Seguridad social».
  void accountId; void grandTotal

  revalidatePath('/nomina')
  return { ok: true }
}
