const URL  = 'https://mykfkltwecslxqsxrkwn.supabase.co'
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15a2ZrbHR3ZWNzbHhxc3hya3duIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc3OTY5NywiZXhwIjoyMDk2MzU1Njk3fQ.YsPnMLdqRzCSlmlbfJ8OeSlVXjNZ1_i413DuzTLvdxg'

const headers = {
  'apikey':        KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type':  'application/json',
}

async function get(table, params = '') {
  const res = await fetch(`${URL}/rest/v1/${table}?${params}`, { headers })
  if (!res.ok) throw new Error(`GET ${table} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function patch(table, id, body) {
  const res = await fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, {
    method:  'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${table} ${id}: ${await res.text()}`)
}

// Fetch data
const [cats, pucs] = await Promise.all([
  get('transaction_categories', 'select=id,name,puc_code&puc_code=not.is.null'),
  get('puc_accounts',           'select=id,codigo,nombre&active=eq.true'),
])

const validCodes = new Set(pucs.map(p => p.codigo))

console.log(`\nCategorías con puc_code:   ${cats.length}`)
console.log(`Cuentas PUC activas:        ${pucs.length}\n`)

const alreadyValid = cats.filter(c => validCodes.has(c.puc_code))
console.log(`Ya válidas (sin cambio):    ${alreadyValid.length}`)

const changed   = []
const unmatched = []

for (const cat of cats) {
  if (validCodes.has(cat.puc_code)) continue

  let match = null
  const maxLen = Math.min(cat.puc_code.length, 10)
  for (let len = maxLen; len >= 4; len--) {
    const prefix = cat.puc_code.slice(0, len)
    const candidates = pucs.filter(p => p.codigo.startsWith(prefix))
    if (candidates.length > 0) {
      match = candidates.sort((a, b) => a.codigo.length - b.codigo.length)[0]
      break
    }
  }

  if (match) {
    changed.push({ id: cat.id, categoryName: cat.name, oldCode: cat.puc_code, newCode: match.codigo, pucNombre: match.nombre })
  } else {
    unmatched.push({ categoryName: cat.name, oldCode: cat.puc_code })
  }
}

// Apply updates
for (const c of changed) {
  await patch('transaction_categories', c.id, { puc_code: c.newCode })
}

// Report
console.log('')
console.log('='.repeat(60))
console.log(`ACTUALIZADAS (${changed.length}):`)
console.log('='.repeat(60))
if (changed.length === 0) {
  console.log('  (ninguna)')
} else {
  for (const c of changed) {
    console.log(`  • ${c.categoryName}`)
    console.log(`    ${c.oldCode}  →  ${c.newCode}  (${c.pucNombre})`)
  }
}

console.log('')
console.log('='.repeat(60))
console.log(`SIN MATCH EN puc_accounts (${unmatched.length}):`)
console.log('='.repeat(60))
if (unmatched.length === 0) {
  console.log('  (ninguna — todos los códigos tienen correspondencia)')
} else {
  for (const u of unmatched) {
    console.log(`  • ${u.categoryName}  [código: ${u.oldCode}]`)
  }
}
console.log('')
