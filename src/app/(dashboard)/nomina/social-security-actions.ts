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

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mes   = `${MESES[month - 1]} ${year}`

  const PUC_CODES = ['52057010', '52056910', '52057210', '52056810']
  const { data: cats } = await supabase
    .from('transaction_categories')
    .select('id, puc_code')
    .in('puc_code', PUC_CODES)

  const catById = Object.fromEntries((cats ?? []).map(c => [c.puc_code, c.id]))

  const txRows = rows.flatMap(r => [
    { description: `Pensión ${r.driver_name} ${mes}`,     amount: r.pension, puc: '52057010' },
    { description: `Salud EPS ${r.driver_name} ${mes}`,   amount: r.salud,   puc: '52056910' },
    { description: `CCF Comfama ${r.driver_name} ${mes}`, amount: r.ccf,     puc: '52057210' },
    { description: `ARL ${r.driver_name} ${mes}`,         amount: r.arl,     puc: '52056810' },
  ]).map(t => ({
    account_id:  accountId,
    type:        'EGRESO',
    amount:      t.amount,
    date:        paidDate,
    description: t.description,
    category:    t.puc,
    category_id: catById[t.puc] ?? null,
    source:      'MANUAL',
  }))

  const { error: txErr } = await supabase.from('bank_transactions').insert(txRows)

  if (txErr) return { ok: false, error: txErr.message }

  revalidatePath('/nomina')
  revalidatePath('/bancos')
  return { ok: true }
}
