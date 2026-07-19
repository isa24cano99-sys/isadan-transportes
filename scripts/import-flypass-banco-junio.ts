#!/usr/bin/env tsx
/**
 * Inserta en `bank_transactions` los pagos electrónicos de Flypass de junio 2026,
 * uno por día, según el extracto real de Bancolombia (cuenta 49900005996).
 *
 * Estos son los débitos reales del banco a Flypass. El detalle de peajes por placa
 * vive en `toll_transactions`; el Estado de Resultados toma los peajes de allí, y
 * excluye estas filas de banco (categoría 61450575) para no duplicar.
 *
 * Idempotente: borra las filas Flypass previas (reference_type='FLYPASS_PEAJE')
 * antes de insertar, así que puede re-ejecutarse sin duplicar.
 *
 * Uso:
 *   npx tsx scripts/import-flypass-banco-junio.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'

// ── Cargar .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').replace(/^﻿/, '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && !process.env[key]) process.env[key] = val
  }
}

loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as any } },
)

const ACCOUNT_NUMBER = '49900005996'
const PEAJE_PUC      = '61450575' // 'Peajes operación'

// Débitos diarios de Flypass en junio 2026 (extracto Bancolombia). Total: $9.793.649
const PAGOS_JUNIO: Array<[string, number]> = [
  ['2026-06-01',   125000],
  ['2026-06-02',   672500],
  ['2026-06-03',   132300],
  ['2026-06-04',   169500],
  ['2026-06-05',   304200],
  ['2026-06-06',   246500],
  ['2026-06-07',    20300],
  ['2026-06-08',    20300],
  ['2026-06-09',   461700],
  ['2026-06-10',   917800],
  ['2026-06-11',   177600],
  ['2026-06-12',   191600],
  ['2026-06-13',    44100],
  ['2026-06-14',   187200],
  ['2026-06-15', 1145800],
  ['2026-06-16',   161400],
  ['2026-06-17',   537000],
  ['2026-06-18',   242900],
  ['2026-06-19',    47100],
  ['2026-06-22',   890900],
  ['2026-06-23',   396800],
  ['2026-06-24',   351400],
  ['2026-06-25',   357110],
  ['2026-06-26',   444039],
  ['2026-06-27',   477000],
  ['2026-06-28',   401200],
  ['2026-06-29',   500800],
  ['2026-06-30',   169600],
]

async function main() {
  // 1. Resolver cuenta destino
  const { data: acc, error: accErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, account_number')
    .eq('account_number', ACCOUNT_NUMBER)
    .single()
  if (accErr || !acc) throw new Error(`No se encontró la cuenta ${ACCOUNT_NUMBER}: ${accErr?.message}`)
  console.log(`Cuenta destino: ${acc.bank_name} (${acc.account_number}) → ${acc.id}`)

  // 2. Resolver categoría "Peajes operación"
  const { data: cat } = await supabase
    .from('transaction_categories')
    .select('id, name')
    .eq('puc_code', PEAJE_PUC)
    .maybeSingle()
  const categoryId = cat?.id ?? null
  console.log(`Categoría peajes: ${cat?.name ?? '(no encontrada)'} → ${categoryId}`)

  // 3. Borrar filas Flypass previas en bancos (idempotencia)
  const { data: deleted, error: delErr } = await supabase
    .from('bank_transactions')
    .delete()
    .eq('reference_type', 'FLYPASS_PEAJE')
    .select('id')
  if (delErr) throw new Error(`Error borrando Flypass previas: ${delErr.message}`)
  console.log(`Filas Flypass borradas: ${deleted?.length ?? 0}`)

  // 4. Insertar los 28 pagos diarios de junio
  const rows = PAGOS_JUNIO.map(([date, amount]) => ({
    account_id:     acc.id,
    date,
    description:    'Pago electrónico Flypass',
    amount,
    type:           'EGRESO',
    category:       PEAJE_PUC,
    category_id:    categoryId,
    source:         'EXTRACTO_BANCOLOMBIA',
    reference_type: 'FLYPASS_PEAJE',
  }))

  const { error: insErr } = await supabase.from('bank_transactions').insert(rows)
  if (insErr) throw new Error(`Error insertando pagos de junio: ${insErr.message}`)

  const total = rows.reduce((s, r) => s + r.amount, 0)
  console.log(`✓ Insertados ${rows.length} pagos electrónicos Flypass de junio. Total: $${total.toLocaleString('es-CO')}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
