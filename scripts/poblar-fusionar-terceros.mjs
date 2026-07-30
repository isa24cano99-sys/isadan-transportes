// Semana 1 — pasos 2/3/(pre-corte): poblar terceros, fusionar 10 pares, corregir 5, marcar pre-corte.
// Requiere la migración 20260728120000 aplicada. Idempotente: no re-puebla si terceros ya tiene filas.
import fs from 'node:fs'
const env = fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }
const URL = get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const rest = async (q, opt = {}) => {
  const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H, ...opt })
  if (!r.ok) throw new Error(`${opt.method || 'GET'} ${q} → ${r.status}: ${await r.text()}`)
  const t = await r.text(); return t ? JSON.parse(t) : null
}
const rpc = (fn, body) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) })
const countWhere = async (table, col, val) => {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${col}&${col}=eq.${encodeURIComponent(val)}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return Number((r.headers.get('content-range') || '*/0').split('/')[1])
}

// DV DIAN
const W = [3,7,13,17,19,23,29,37,41,43,47,53,59,67,71]
const digits = v => String(v ?? '').replace(/\D/g, '')
const calcularDV = nit => { const d = digits(nit).split('').reverse(); let s = 0; for (let i = 0; i < d.length; i++) s += Number(d[i]) * W[i]; const r = s % 11; return r < 2 ? r : 11 - r }
const esPegado = v => { const x = digits(v); if (!/^[89]\d{9}$/.test(x)) return null; const base = x.slice(0, 9), dv = Number(x[9]); return calcularDV(base) === dv ? { base, dv } : null }
const COMPANY = /\b(s\.?a\.?s\.?|sas|ltda|limitada|s\.?a\.?|e\.?u\.?|s\.?c\.?a\.?|cia|compania|coop|cooperativa|inversiones|transportes?|logistic|carga|comercial|distribuidora|soluciones)\b/i

const PARES = [ // [sobreviviente 9d, duplicado 10d]
  ['900941508','9009415081'],['901799792','9017997922'],['901050139','9010501397'],
  ['811046120','8110461206'],['901447844','9014478447'],['901443158','9014431584'],
  ['901411423','9014114234'],['890935085','8909350858'],['901249728','9012497281'],
  ['900138913','9001389138'],
]
const CORRECCIONES = ['9013892021','9003144131','9004445556','8307778889','8110457415'] // 10d → base

const main = async () => {
  const [clients, suppliers, catalog, terExist] = await Promise.all([
    rest('clients?select=id,name,nit&limit=50000'),
    rest('suppliers?select=id,name,nit&limit=50000'),
    rest('supplier_catalog?select=id,nombre,nit,cuenta_puc,categoria&limit=50000'),
    rest('terceros?select=id&limit=1'),
  ])

  // ── PASO 1: poblar terceros ────────────────────────────────────────────────
  if (terExist.length) {
    console.log('terceros ya tiene filas — se omite la población (idempotencia).')
  } else {
    const agg = new Map() // numero -> {names:Set, esCli, esProv, puc}
    const add = (nit, name, kind, puc) => {
      const num = digits(nit); if (!num) return
      let e = agg.get(num); if (!e) { e = { names: new Set(), esCli: false, esProv: false, puc: null }; agg.set(num, e) }
      if (name && String(name).trim()) e.names.add(String(name).trim())
      if (kind === 'cli') e.esCli = true; if (kind === 'prov') e.esProv = true
      if (puc && !e.puc) e.puc = puc
    }
    for (const c of clients) add(c.nit, c.name, 'cli')
    for (const s of suppliers) add(s.nit, s.name, 'prov')
    for (const s of catalog) add(s.nit, s.nombre, (s.categoria === 'CLIENTE' ? 'cli' : 'prov'), s.cuenta_puc)

    const rows = []
    for (const [num, e] of agg) {
      const bestName = [...e.names].sort((a, b) => b.length - a.length)[0] || num
      const juridica = COMPANY.test(bestName) || /^[89]\d{8,9}$/.test(num)
      const tipo_persona = juridica ? 'JURIDICA' : 'NATURAL'
      const tipo_documento = juridica ? '31' : '13'
      const pegado = esPegado(num)
      const dv = (tipo_documento === '31' && !pegado) ? calcularDV(num) : null
      rows.push({
        tipo_persona, tipo_documento, numero_identificacion: num, digito_verificacion: dv,
        razon_social: juridica ? bestName : null,
        primer_nombre: juridica ? null : bestName,   // placeholder para naturales; Isabella lo separa
        es_cliente: e.esCli, es_proveedor: e.esProv, cuenta_puc_sugerida: e.puc, activo: true,
      })
    }
    await rest('terceros', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
    console.log(`Poblados ${rows.length} terceros.`)

    // set tercero_id en las tablas legado
    const idByNum = new Map((await rest('terceros?select=id,numero_identificacion&limit=50000')).map(t => [t.numero_identificacion, t.id]))
    const link = async (table, rowsSrc, nitField) => {
      let n = 0
      for (const r of rowsSrc) { const tid = idByNum.get(digits(r.nit)); if (!tid) continue
        await rest(`${table}?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ tercero_id: tid }) }); n++ }
      console.log(`  ${table}.tercero_id enlazados: ${n}`)
    }
    await link('clients', clients); await link('suppliers', suppliers); await link('supplier_catalog', catalog)
  }

  const terceros = await rest('terceros?select=id,numero_identificacion,razon_social,completo&limit=50000')
  const idBy = new Map(terceros.map(t => [t.numero_identificacion, t]))
  console.log(`\nTotal terceros: ${terceros.length} · completo=true: ${terceros.filter(t => t.completo).length}`)

  // ── PASO 2a: 10 fusiones ───────────────────────────────────────────────────
  console.log('\n── FUSIONES (10) ──')
  for (const [sob, dup] of PARES) {
    const ts = idBy.get(sob), td = idBy.get(dup)
    if (!ts || !td) { console.log(`  ⚠ ${sob}↔${dup}: falta tercero (sob:${!!ts} dup:${!!td}) — SALTA`); continue }
    // nombre más completo entre los dos → al sobreviviente
    const best = [ts.razon_social, td.razon_social].filter(Boolean).sort((a, b) => b.length - a.length)[0]
    if (best && best !== ts.razon_social) await rest(`terceros?id=eq.${ts.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ razon_social: best }) })
    const before = await countWhere('bank_transactions', 'supplier_nit', dup)
    try {
      const af = await rpc('fusionar_terceros', { id_sobreviviente: ts.id, id_duplicado: td.id })
      const after = await countWhere('bank_transactions', 'supplier_nit', dup)
      console.log(`  ✓ ${sob} ← ${dup} [${best}] · bank ${before}→${after} · afectadas: ${JSON.stringify(af)}`)
    } catch (e) { console.log(`  ✗ ${sob} ← ${dup}: ${e.message}`) }
  }

  // ── PASO 2b: 5 correcciones (solo existe la pegada) ────────────────────────
  console.log('\n── CORRECCIONES (5) ──')
  for (const dup of CORRECCIONES) {
    const t = idBy.get(dup); const p = esPegado(dup)
    if (!t || !p) { console.log(`  ⚠ ${dup}: sin tercero o no es pegado — SALTA`); continue }
    if (idBy.get(p.base)) { console.log(`  ⚠ ${dup}: ya existe base ${p.base} → debería ser FUSIÓN, no corrección`); continue }
    const nombre = t.razon_social
    // actualizar tercero (numero + DV) y NITs denormalizados
    await rest(`terceros?id=eq.${t.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ numero_identificacion: p.base, digito_verificacion: p.dv }) })
    for (const [table, nf, nmf] of [['bank_transactions','supplier_nit','supplier_name'],['accounts_receivable_entries','client_nit','client_name'],['client_payments','client_nit','client_name'],['description_patterns','supplier_nit','supplier_name'],['supplier_catalog','nit','nombre']]) {
      await rest(`${table}?${nf}=eq.${dup}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ [nf]: p.base, [nmf]: nombre }) })
    }
    // verificar orfandad
    let orphan = 0
    for (const [table, nf] of [['bank_transactions','supplier_nit'],['accounts_receivable_entries','client_nit'],['client_payments','client_nit'],['description_patterns','supplier_nit'],['supplier_catalog','nit']]) orphan += await countWhere(table, nf, dup)
    console.log(`  ${orphan === 0 ? '✓' : '✗'} ${dup} → ${p.base}+DV${p.dv} · huérfanos restantes: ${orphan}`)
  }

  // ── PASO 3: pre-corte ──────────────────────────────────────────────────────
  await rest(`bank_transactions?date=lt.2026-07-01`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ periodo_pre_corte: true }) })
  const preN = await (async () => { const r = await fetch(`${URL}/rest/v1/bank_transactions?select=id&periodo_pre_corte=is.true`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return (r.headers.get('content-range') || '*/0').split('/')[1] })()
  console.log(`\n── PRE-CORTE ── periodo_pre_corte=true en ${preN} movimientos (≤ 2026-06-30)`)

  // resumen final
  const terFin = await rest('terceros?select=id,completo,merged_into&limit=50000')
  console.log(`\n═══ RESUMEN ═══`)
  console.log(`terceros: ${terFin.length} · activos(no fusionados): ${terFin.filter(t => !t.merged_into).length} · fusionados: ${terFin.filter(t => t.merged_into).length} · completo=true: ${terFin.filter(t => t.completo).length}`)
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
