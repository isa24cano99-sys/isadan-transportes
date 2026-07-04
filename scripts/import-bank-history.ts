#!/usr/bin/env tsx
/**
 * Importa el historial bancario desde el extracto Excel de Bancolombia.
 *
 * Pre-requisitos (ejecutar en Supabase SQL editor):
 *   create table if not exists description_patterns (
 *     id uuid primary key default uuid_generate_v4(),
 *     pattern text not null unique,
 *     category_id uuid references transaction_categories(id),
 *     match_count integer default 1,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 *   alter table description_patterns disable row level security;
 *   grant all on description_patterns to service_role;
 *
 *   alter table bank_transactions add column if not exists external_ref text;
 *   create unique index if not exists idx_bt_ext_ref
 *     on bank_transactions(account_id, external_ref) where external_ref is not null;
 *
 * Uso:
 *   npm run import-bank
 *   npm run import-bank -- ruta/al/archivo.xlsx
 */

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { createHash } from 'crypto'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { categorizarPorReglas, normalizarDescripcion } from '../src/lib/transaction-categorizer'

// ── Cargar .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
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
const BATCH_SIZE     = 50

const SUPPLIER_RULES: { keywords: string[]; nit: string; name: string }[] = [
  { keywords: ['flypass', 'peaje'],       nit: '900219834', name: 'F2X S.A.S.' },
  { keywords: ['mundial', 'fap'],         nit: '860037013', name: 'COMPAÑIA MUNDIAL DE SEGUROS S.A.' },
  { keywords: ['comfama'],                nit: '890900841', name: 'COMFAMA' },
  { keywords: ['aportes en linea'],       nit: '900147238', name: 'APORTES EN LINEA S.A.' },
  { keywords: ['epm'],                    nit: '890904996', name: 'EPM' },
  { keywords: ['comcel', 'claro'],        nit: '800153993', name: 'COMUNICACION CELULAR S.A. COMCEL' },
  { keywords: ['dataico'],               nit: '901223648', name: 'DATAICO SAS' },
]

function resolverProveedor(desc: string): { nit: string; name: string } | null {
  const normed = normalizarDescripcion(desc)
  for (const rule of SUPPLIER_RULES) {
    if (rule.keywords.some(kw => normed.includes(kw))) {
      return { nit: rule.nit, name: rule.name }
    }
  }
  return null
}

function md5(s: string) {
  return createHash('md5').update(s).digest('hex')
}

function toDateStr(raw: unknown): string | null {
  if (!raw) return null
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof raw === 'number') {
    const info = XLSX.SSF.parse_date_code(raw)
    return `${info.y}-${String(info.m).padStart(2, '0')}-${String(info.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  return s || null
}

async function main() {
  const xlsxPath = process.argv.find(a => a.endsWith('.xlsx') || a.endsWith('.xls'))
    ?? path.join(process.cwd(), 'uploads', 'Banco_ISADAN.xlsx')

  if (!fs.existsSync(xlsxPath)) {
    console.error(`Archivo no encontrado: ${xlsxPath}`)
    console.error('Coloca el archivo en uploads/Banco_ISADAN.xlsx o pasa la ruta como argumento.')
    process.exit(1)
  }

  console.log(`Leyendo: ${path.basename(xlsxPath)}`)

  const workbook = XLSX.readFile(xlsxPath, { cellDates: true })
  const sheet    = workbook.Sheets[workbook.SheetNames[0]]
  const rows     = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  // Fila 1, columna F (índice 5) = saldo inicial
  const initialBalance = Number(rows[0]?.[5]) || 0

  // ── Obtener cuenta ──────────────────────────────────────────────────────────
  const { data: account, error: accErr } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('account_number', ACCOUNT_NUMBER)
    .single()

  if (accErr || !account) {
    console.error('No se encontró la cuenta con account_number:', ACCOUNT_NUMBER)
    process.exit(1)
  }

  if (initialBalance > 0) {
    await supabase
      .from('bank_accounts')
      .update({ initial_balance: initialBalance })
      .eq('id', account.id)
    console.log(`Saldo inicial: $${initialBalance.toLocaleString('es-CO')}`)
  }

  // ── Cargar categorías para resolución nombre → id/puc_code ─────────────────
  const { data: cats } = await supabase
    .from('transaction_categories')
    .select('id, name, puc_code')
    .eq('active', true)

  type CatInfo = { id: string; puc_code: string | null }
  const catByName = new Map<string, CatInfo>((cats ?? []).map(c => [c.name.toLowerCase(), { id: c.id, puc_code: c.puc_code }]))
  const catById   = new Map<string, CatInfo>((cats ?? []).map(c => [c.id, { id: c.id, puc_code: c.puc_code }]))

  // ── Cargar patrones aprendidos ──────────────────────────────────────────────
  const { data: patterns } = await supabase
    .from('description_patterns')
    .select('pattern, category_id')
    .order('match_count', { ascending: false })
    .limit(500)
  const patternList = patterns ?? []

  // ── Cargar external_refs existentes para deduplicar ─────────────────────────
  const { data: existingRows } = await supabase
    .from('bank_transactions')
    .select('external_ref')
    .eq('account_id', account.id)
    .not('external_ref', 'is', null)

  const existingRefs = new Set((existingRows ?? []).map((r: any) => r.external_ref as string))
  console.log(`Transacciones ya existentes: ${existingRefs.size}`)
  if (existingRefs.size > 0) {
    const sample = [...existingRefs].slice(0, 2)
    console.log('  Ejemplos de refs existentes:', sample)
  }

  // ── Función de categorización ───────────────────────────────────────────────
  function resolverCategoria(desc: string): CatInfo | null {
    const ruleName = categorizarPorReglas(desc)
    if (ruleName) return catByName.get(ruleName.toLowerCase()) ?? null

    const normed = normalizarDescripcion(desc)
    const match  = patternList.find(p => normed.includes(p.pattern))
    if (match?.category_id) return catById.get(match.category_id) ?? null
    return null
  }

  // ── Procesar filas (desde fila 5, índice 4) ─────────────────────────────────
  const dataRows = rows.slice(4)
  const stats    = { total: 0, inserted: 0, duplicates: 0, categorized: 0, sinCategoria: 0 }
  const toInsert: any[] = []

  // DIAGNÓSTICO: imprimir las primeras 3 filas raw antes de procesar
  console.log('\n── Primeras 3 filas raw (índices 4-6 del sheet) ──')
  for (let i = 0; i < 3; i++) {
    const r = dataRows[i] as unknown[]
    console.log(`  [${i}] dateRaw=${JSON.stringify(r?.[0])}  desc=${JSON.stringify(r?.[1])}  ingreso=${r?.[2]}  egreso=${r?.[3]}  gmf=${r?.[4]}`)
  }
  console.log('──────────────────────────────────────────────────\n')

  let diagCount = 0 // solo loguea las primeras 3 transacciones procesadas

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row     = dataRows[rowIdx]
    const r       = row as unknown[]
    const dateRaw = r[0]
    const desc    = String(r[1] ?? '').trim()
    const ingreso = Number(r[2]) || 0
    const egreso  = Number(r[3]) || 0
    const gmf     = Number(r[4]) || 0

    if (!dateRaw && !desc) continue
    const dateStr = toDateStr(dateRaw)
    if (!dateStr) continue

    const addTx = (tipo: 'INGRESO' | 'EGRESO', monto: number, txDesc: string) => {
      stats.total++
      const ref = md5(`${rowIdx}:${dateStr}:${txDesc}:${monto}`)

      // DIAGNÓSTICO: imprimir primeras 3 transacciones procesadas
      if (diagCount < 3) {
        console.log(`  [diag ${diagCount}] tipo=${tipo} fecha=${dateStr} desc="${txDesc}" monto=${monto}`)
        console.log(`           ref=${ref}  yaExiste=${existingRefs.has(ref)}`)
        diagCount++
      }

      if (existingRefs.has(ref)) { stats.duplicates++; return }
      existingRefs.add(ref)

      const cat      = resolverCategoria(txDesc)
      const supplier = resolverProveedor(txDesc)
      if (cat) stats.categorized++
      else stats.sinCategoria++

      toInsert.push({
        account_id:    account.id,
        type:          tipo,
        amount:        monto,
        date:          dateStr,
        description:   txDesc,
        category:      cat?.puc_code ?? 'SIN_CLASIFICAR',
        category_id:   cat?.id ?? null,
        source:        'MANUAL',
        external_ref:  ref,
        supplier_nit:  supplier?.nit ?? null,
        supplier_name: supplier?.name ?? null,
      })
    }

    if (ingreso > 0) addTx('INGRESO', ingreso, desc)
    if (egreso  > 0) addTx('EGRESO',  egreso,  desc)
    if (gmf     > 0) {
      stats.total++
      const gmfDesc = 'GMF 4x1000'
      const ref     = md5(`${rowIdx}:${dateStr}:${gmfDesc}:${gmf}`)
      if (!existingRefs.has(ref)) {
        existingRefs.add(ref)
        const gmfCat = catByName.get('gmf 4x1000') ?? null
        if (gmfCat) stats.categorized++
        else stats.sinCategoria++
        toInsert.push({
          account_id:   account.id,
          type:         'EGRESO',
          amount:       gmf,
          date:         dateStr,
          description:  gmfDesc,
          category:     gmfCat?.puc_code ?? 'SIN_CLASIFICAR',
          category_id:  gmfCat?.id ?? null,
          source:       'MANUAL',
          external_ref: ref,
        })
      } else {
        stats.duplicates++
      }
    }
  }

  // ── Insertar en lotes ───────────────────────────────────────────────────────
  console.log(`\nTotal a insertar: ${toInsert.length}`)
  if (toInsert.length > 0) {
    console.log('  Primer ítem:', JSON.stringify(toInsert[0], null, 2))
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('bank_transactions').insert(batch)
    if (error) {
      console.error(`\nError lote ${i}–${i + batch.length}:`)
      console.error('  message:', error.message)
      console.error('  code:   ', (error as any).code)
      console.error('  details:', (error as any).details)
      console.error('  hint:   ', (error as any).hint)
      if (i === 0) {
        console.error('  Primer ítem del lote fallido:', JSON.stringify(batch[0], null, 2))
      }
      break // detener en el primer error para no inundar la consola
    } else {
      stats.inserted += batch.length
    }
    process.stdout.write(`\rInsertando ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}...`)
  }

  // ── Resumen ─────────────────────────────────────────────────────────────────
  console.log('\n')
  console.log('═══════════════════════════════════')
  console.log('  Resultado')
  console.log('═══════════════════════════════════')
  console.log(`  Filas procesadas:   ${stats.total}`)
  console.log(`  Insertadas:         ${stats.inserted}`)
  console.log(`  Duplicadas:         ${stats.duplicates}`)
  console.log(`  Categorizadas:      ${stats.categorized}`)
  console.log(`  Sin categoría:      ${stats.sinCategoria}`)
  if (stats.sinCategoria > 0) {
    console.log('\n  Tip: usa el botón "Recategorizar" en /bancos/[id] para')
    console.log('  categorizar el resto con los patrones aprendidos.')
  }
  console.log('═══════════════════════════════════')
}

main().catch(err => { console.error(err); process.exit(1) })
