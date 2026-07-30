// Diagnóstico de terceros/duplicados — SOLO LECTURA. No modifica ningún dato.
// Ejecutar:  node scripts/diagnostico-terceros.mjs
import fs from 'node:fs'

// --- credenciales desde .env.local (BOM-safe) ---
const env = fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }
const URL = get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const rest = async q => {
  const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H })
  if (!r.ok) throw new Error(`${q} → ${r.status}: ${await r.text()}`)
  return r.json()
}

// --- DV DIAN (módulo 11) ---
const W = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
const digits = v => String(v ?? '').replace(/\D/g, '')
function calcularDV(nit) {
  const d = digits(nit).split('').reverse()
  let s = 0; for (let i = 0; i < d.length; i++) s += Number(d[i]) * W[i]
  const r = s % 11; return r < 2 ? r : 11 - r
}
// NIT de 10 dígitos que empieza por 8/9 cuyo 10º dígito es el DV de los primeros 9
function esPegado(v) {
  const x = digits(v); if (!/^[89]\d{9}$/.test(x)) return null
  const base = x.slice(0, 9), dv = Number(x[9])
  return calcularDV(base) === dv ? { base, dv } : null
}
// normalización de nombres para (c)
const stripAcc = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const normName = s => stripAcc(String(s ?? '')).toUpperCase()
  .replace(/[.,]/g, '')
  .replace(/\b(SAS|SA|LTDA|LIMITADA|EU|SCA|SENC|CIA|SOCIEDAD|ANONIMA|ANÓNIMA|S EN C)\b/g, '')
  .replace(/\s+/g, ' ').trim()

const fmt = n => '$' + Math.round(n).toLocaleString('es-CO')
const CONSUMIDOR_FINAL = '222222222222'

const main = async () => {
  // --- cargar las 10 fuentes ---
  const [clients, suppliers, catalog, invoices, bankTx, cliPay, arEntries, patterns, tolls, dian] = await Promise.all([
    rest('clients?select=id,name,nit&limit=50000'),
    rest('suppliers?select=id,name,nit&limit=50000'),
    rest('supplier_catalog?select=id,nombre,nit&limit=50000'),
    rest('invoices?select=id,invoice_number,client_nit,client_name,total_amount,dian_status,credit_note_number,invoice_type&limit=50000'),
    rest('bank_transactions?select=supplier_nit,supplier_name,amount&limit=50000'),
    rest('client_payments?select=client_nit,client_name,amount&limit=50000'),
    rest('accounts_receivable_entries?select=client_nit,client_name,invoice_amount&limit=50000'),
    rest('description_patterns?select=supplier_nit,supplier_name&limit=50000'),
    rest('toll_transactions?select=nit&limit=50000'),
    rest('dian_invoices_import?select=nit_issuer,name_issuer,nit_receiver,name_receiver&limit=50000'),
  ])

  // --- índice unificado por identificación (string cruda de dígitos) ---
  // idMap: idDigits -> { raw:Set, names:Set, tables:{tabla:count}, money:number }
  const idMap = new Map()
  const touch = (rawId, name, table, money = 0) => {
    const raw = String(rawId ?? '').trim()
    if (!raw) return
    const id = digits(raw) || raw   // si no tiene dígitos, usa el raw (para no-numéricos)
    let e = idMap.get(id)
    if (!e) { e = { id, raw: new Set(), names: new Set(), tables: {}, money: 0, nonNumeric: /\D/.test(raw) && digits(raw) === '' } ; idMap.set(id, e) }
    e.raw.add(raw)
    if (name && String(name).trim()) e.names.add(String(name).trim())
    e.tables[table] = (e.tables[table] || 0) + 1
    e.money += Number(money) || 0
  }

  for (const c of clients)   touch(c.nit, c.name,   'clients')
  for (const s of suppliers) touch(s.nit, s.name,   'suppliers')
  for (const s of catalog)   touch(s.nit, s.nombre, 'supplier_catalog')
  for (const i of invoices)  touch(i.client_nit, i.client_name, 'invoices', i.total_amount)
  for (const t of bankTx)    touch(t.supplier_nit, t.supplier_name, 'bank_transactions', t.amount)
  for (const p of cliPay)    touch(p.client_nit, p.client_name, 'client_payments', p.amount)
  for (const a of arEntries) touch(a.client_nit, a.client_name, 'accounts_receivable_entries', a.invoice_amount)
  for (const p of patterns)  touch(p.supplier_nit, p.supplier_name, 'description_patterns')
  for (const t of tolls)     touch(t.nit, null, 'toll_transactions')
  for (const d of dian) { touch(d.nit_issuer, d.name_issuer, 'dian_invoices_import'); touch(d.nit_receiver, d.name_receiver, 'dian_invoices_import') }

  const totalRows = e => Object.values(e.tables).reduce((a, b) => a + b, 0)
  const tablesStr = e => Object.entries(e.tables).map(([t, n]) => `${t}:${n}`).join(' ')
  const nameOf = e => [...e.names][0] ?? '(sin nombre)'

  console.log('══════════════════════════════════════════════════════════════')
  console.log(' DIAGNÓSTICO DE TERCEROS — SOLO LECTURA (no se modificó nada)')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`Identificaciones distintas: ${idMap.size}`)
  console.log(`Fuentes: clients ${clients.length}, suppliers ${suppliers.length}, supplier_catalog ${catalog.length}, invoices ${invoices.length}, bank_transactions ${bankTx.length}, client_payments ${cliPay.length}, ar_entries ${arEntries.length}, description_patterns ${patterns.length}, toll_transactions ${tolls.length}, dian_import ${dian.length}`)

  // ── (a) NIT+DV pegados ──────────────────────────────────────────────
  console.log('\n── (a) NIT con DÍGITO DE VERIFICACIÓN PEGADO (10 díg, empieza 8/9, DV OK) ──')
  const pegados = []
  for (const e of idMap.values()) {
    const p = esPegado(e.id)
    if (p) pegados.push({ e, ...p })
  }
  pegados.sort((x, y) => y.e.money - x.e.money || totalRows(y.e) - totalRows(x.e))
  if (!pegados.length) console.log('  (ninguno)')
  for (const { e, base, dv } of pegados) {
    const baseExists = idMap.has(base)
    console.log(`  • ${e.id}  →  base ${base} + DV ${dv}   [${nameOf(e)}]`)
    console.log(`      filas: ${totalRows(e)} (${tablesStr(e)}) · $ asociado: ${fmt(e.money)}`)
    console.log(`      ¿existe también el NIT correcto ${base} en los datos? ${baseExists ? 'SÍ ⇒ par confirmado (b)' : 'no (solo aparece la versión pegada)'}`)
  }

  // ── (b) pares 9 díg ↔ 10 díg (mismo tercero) ────────────────────────
  console.log('\n── (b) PARES: NIT de 9 dígitos y su versión de 10 (9+DV) que coexisten ──')
  const pares = pegados.filter(p => idMap.has(p.base))
  if (!pares.length) console.log('  (ninguno coexiste; los pegados de arriba solo aparecen en su forma de 10)')
  for (const { e, base } of pares) {
    const b = idMap.get(base)
    console.log(`  • ${base} [${nameOf(b)}] (${totalRows(b)} filas, ${fmt(b.money)})  ⟷  ${e.id} [${nameOf(e)}] (${totalRows(e)} filas, ${fmt(e.money)})`)
    console.log(`      SOBREVIVIENTE sugerido: ${base} (9 díg, válido en RUT) · DUPLICADO: ${e.id}`)
  }

  // ── (c) nombres similares con NIT distinto ──────────────────────────
  console.log('\n── (c) NOMBRES SIMILARES CON IDENTIFICACIÓN DISTINTA ──')
  const byName = new Map()
  for (const e of idMap.values()) {
    for (const nm of e.names) {
      const k = normName(nm); if (!k) continue
      let g = byName.get(k); if (!g) { g = new Set(); byName.set(k, g) }
      g.add(e.id)
    }
  }
  let cCount = 0
  for (const [k, ids] of byName) {
    if (ids.size < 2) continue
    // omitir los que ya son par (a/b) para no repetir ruido
    cCount++
    const list = [...ids].map(id => `${id} [${nameOf(idMap.get(id))}] (${totalRows(idMap.get(id))} filas)`)
    console.log(`  • "${k}" →`)
    for (const l of list) console.log(`      ${l}`)
  }
  if (!cCount) console.log('  (ninguno)')

  // ── (d) identificaciones no numéricas ───────────────────────────────
  console.log('\n── (d) IDENTIFICACIONES NO NUMÉRICAS / INVÁLIDAS ──')
  const noNum = [...idMap.values()].filter(e => e.nonNumeric)
  if (!noNum.length) console.log('  (ninguna)')
  for (const e of noNum) console.log(`  • "${[...e.raw][0]}" [${nameOf(e)}] · filas: ${totalRows(e)} (${tablesStr(e)})`)

  // ── (e) top por nº de registros / dinero ────────────────────────────
  console.log('\n── (e) IDENTIFICACIONES CON MÁS REGISTROS / DINERO (top 20) ──')
  const top = [...idMap.values()].sort((a, b) => totalRows(b) - totalRows(a) || b.money - a.money).slice(0, 20)
  for (const e of top) console.log(`  ${e.id.padEnd(14)} filas ${String(totalRows(e)).padStart(4)} · ${fmt(e.money).padStart(16)} · [${nameOf(e)}] (${tablesStr(e)})`)

  // ── consumidor final ────────────────────────────────────────────────
  console.log('\n── CONSUMIDOR FINAL (222222222222) — NO es duplicado ──')
  const cf = idMap.get(CONSUMIDOR_FINAL)
  if (cf) console.log(`  ${CONSUMIDOR_FINAL} · filas: ${totalRows(cf)} (${tablesStr(cf)}) · $ asociado: ${fmt(cf.money)}  ← marcar aparte`)
  else console.log('  (no aparece)')

  // ── ADDENDUM FACTURAS ───────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' ADDENDUM — FACTURAS CON NIT DE 10 DÍGITOS (pegado)')
  console.log('══════════════════════════════════════════════════════════════')
  const invMalNit = invoices.filter(i => esPegado(i.client_nit))
  const anul = i => i.dian_status === 'ANULADA' || i.credit_note_number
  const invAnuladas = invMalNit.filter(anul)
  const invVigentes = invMalNit.filter(i => !anul(i))
  const sum = arr => arr.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  console.log(`Facturas con client_nit pegado: ${invMalNit.length} · valor total ${fmt(sum(invMalNit))}`)
  console.log(`  ANULADAS (dian_status ANULADA o con NC): ${invAnuladas.length} · valor ${fmt(sum(invAnuladas))}`)
  for (const i of invAnuladas) console.log(`     - ${i.invoice_number} · ${i.client_nit} · ${i.client_name} · ${fmt(i.total_amount)} · ${i.dian_status}${i.credit_note_number ? ' ('+i.credit_note_number+')' : ''}`)
  console.log(`  VIGENTES con NIT malo (⚠ faltaría anular): ${invVigentes.length} · valor ${fmt(sum(invVigentes))}`)
  for (const i of invVigentes) console.log(`     ⚠ ${i.invoice_number} · ${i.client_nit} · ${i.client_name} · ${fmt(i.total_amount)} · ${i.dian_status ?? 'sin estado'}`)
  if (!invVigentes.length) console.log('     ✓ ninguna factura vigente con NIT pegado')

  console.log('\n(FIN — no se modificó ningún dato)')
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
