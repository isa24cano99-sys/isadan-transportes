#!/usr/bin/env tsx
/**
 * Limpieza única de `toll_transactions` para may–jul 2026 y re-importación limpia
 * desde el reporte Flypass "movimientos", usando Referencia 2 como id único y
 * extrayendo el nombre del peaje de la descripción.
 *
 * Motivo: imports previos guardaron may–jul con document="N/A"/"NC" (no dedup) y
 * sin toll_name, y hay solapamiento con un import de formato antiguo → peajes
 * duplicados. Abril (formato antiguo) se conserva intacto.
 *
 * Uso:
 *   npx tsx scripts/reimport-flypass-mayjul.ts "C:/Users/Isabella/transcarga/Flypass May-jul.xlsx"
 */

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').replace(/^﻿/, '').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (k && !process.env[k]) process.env[k] = v
  }
}
loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as any } },
)

const DESDE = '2026-05-01' // se borra y re-importa pass_date >= esta fecha

// ── Parser (idéntico a peajes-actions.ts) ─────────────────────────────────────
const norm = (s: string) => s.trim().normalize('NFC')
function getCol(row: any, ...names: string[]): string {
  const r: any = {}; for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const n of names) { const v = r[norm(n)]; if (v !== undefined && v !== null && v !== '') return String(v).trim() }
  return ''
}
function getNum(row: any, ...names: string[]): number {
  const r: any = {}; for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const n of names) {
    const v = r[norm(n)]; if (v === undefined || v === null) continue
    if (typeof v === 'number') return isNaN(v) ? 0 : v
    const p = parseFloat(String(v).trim().replace(/[$\s.]/g, '').replace(',', '.')); if (!isNaN(p)) return p
  }
  return 0
}
function parseFlypassDate(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString()
  const s = String(val).trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`
  return s || null
}
const extractRef2      = (d: string) => d.match(/Referencia\s*2:\s*([^-]+?)\s*-/i)?.[1]?.trim() ?? ''
const extractTollName  = (d: string) => d.match(/Descripci[oó]n:\s*(.+?)\s*-\s*Fecha/i)?.[1]?.trim() ?? ''

function mapFlypass(raw: any) {
  const dateRaw = raw['Fecha'] ?? raw['F.Paso']
  const desc = getCol(raw, 'Descripcion', 'Descripción')
  const rawNorm: any = {}; for (const [k, v] of Object.entries(raw)) rawNorm[norm(k)] = v
  const tieneValor = norm('Valor') in rawNorm
  const total = tieneValor ? -getNum(raw, 'Valor') : getNum(raw, 'Total')
  return {
    status:    getCol(raw, 'Estado'),
    type:      getCol(raw, 'Tipo de movimiento', 'Tipo'),
    document:  extractRef2(desc) || getCol(raw, 'Documento contable', 'Documento'),
    plate:     getCol(raw, 'Placa'),
    toll_name: getCol(raw, 'Peaje') || extractTollName(desc),
    category:  getCol(raw, 'Categoria', 'Categoría'),
    pass_date: parseFlypassDate(dateRaw),
    subtotal:  0, tax: 0, total,
    cufe:      getCol(raw, 'CUFE', 'Cufe'),
    nit:       getCol(raw, 'NIT', 'Nit'),
  }
}

async function main() {
  const file = process.argv[2] || 'C:/Users/Isabella/transcarga/Flypass May-jul.xlsx'
  if (!fs.existsSync(file)) throw new Error(`No existe el archivo: ${file}`)

  // 1. Borrar may–jul actual
  const { data: del, error: delErr } = await supabase
    .from('toll_transactions').delete().gte('pass_date', `${DESDE}T00:00:00`).select('id')
  if (delErr) throw new Error(`Error borrando: ${delErr.message}`)
  console.log(`Filas toll_transactions borradas (>= ${DESDE}): ${del?.length ?? 0}`)

  // 2. Parsear y re-importar
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true })
  const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[]
  const rows = json
    .map(mapFlypass)
    .filter(r => r.plate && (!r.type || /peaje/i.test(r.type)))
    .filter(r => r.pass_date && r.pass_date.slice(0, 10) >= DESDE)

  console.log(`Filas de peaje a insertar (>= ${DESDE}): ${rows.length}`)

  let inserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase.from('toll_transactions').insert(batch)
    if (error) throw new Error(`Error insertando lote ${i}: ${error.message}`)
    inserted += batch.length
  }
  const total = rows.reduce((s, r) => s + r.total, 0)
  console.log(`✓ Insertadas ${inserted} filas. Neto peajes may–jul: $${Math.round(total).toLocaleString('es-CO')}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
