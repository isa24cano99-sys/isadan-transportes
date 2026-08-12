import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import EstadoResultadosClient from './EstadoResultadosClient'

export const dynamic = 'force-dynamic'

// ── Category sets ─────────────────────────────────────────────────────────────
const PERSONAL_COST_CATS   = ['52050610','52059510','52056810','52057010','52057210','52056910','52053010','52053610','52053910','52052710','52058410','52058495']
const GENERAL_COST_CATS    = ['52201005','52304010','52352010','52353010','52353510','52401005','52950510','52956010','51103010']
const FINANCIAL_EXP_CATS   = ['53050505','53050510','53152010']
const TAX_CATS             = ['51150510']
const PERSONAL_OWNER_CATS  = ['52959510','52959511','52959505','52959507','52959520','52959530','52959535']
const ANTICIPO_CATS        = ['28050510']
const ANTICIPO_NO_LEG_CATS = ['13301510']
const FINANCIAL_INC_CATS   = ['42100510']
// Los peajes se toman de `toll_transactions` (agrupados por placa, ver `tolls`).
// Las transacciones bancarias con esta categoría NO se suman en el P&L para evitar
// doble conteo — por eso 61450575 no está en ningún set de arriba y se filtra en extractBankTx.
const PEAJE_PUC_EXCLUIDO   = '61450575'

export type RawInvoice = {
  month: number
  clientName: string
  clientNit: string | null
  invoiceNumber: string | null
  amount: number
}

export type RawTx = {
  id: string
  month: number
  date: string | null
  pucCode: string
  description: string | null
  supplierName: string | null
  categoryId: string | null
  categoryName: string | null
  amount: number
}

export type RawAnticipo = {
  month: number
  amount: number
  description: string | null
  clientName: string
  clientNit: string | null
}

export type RawLegExp = {
  month: number
  plate: string | null
  expenseType: string
  amount: number
  description: string | null
}

export type RawToll = {
  month: number
  plate: string | null
  amount: number
}

export type SinClasificar = {
  id: string
  month: number
  date: string | null
  description: string | null
  amount: number
  type: 'INGRESO' | 'EGRESO'
}

export type PYLData = {
  year: number
  availableYears: number[]
  invoices: RawInvoice[]
  anticipos: RawAnticipo[]
  legExps: RawLegExp[]
  tolls: RawToll[]
  personalCosts: RawTx[]
  generalCosts: RawTx[]
  financialExps: RawTx[]
  financialIncs: RawTx[]
  taxes: RawTx[]
  personalOwner: RawTx[]
  anticiposNoLeg: RawTx[]
  sinClasificar: SinClasificar[]
  sinClasificarAccountId: string | null
}

function toMonth(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  try {
    const clean = (dateStr as string).substring(0, 10)
    return new Date(clean + 'T00:00:00').getMonth() + 1
  } catch {
    return null
  }
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ año?: string }>
}) {
  const sp   = await searchParams
  const year = parseInt(sp.año ?? '') || new Date().getFullYear()
  const from = `${year}-01-01`
  const to   = `${year}-12-31`

  const [invoiceRows, bankTxRows, legExpRows, tollRows, clientsRes, supRes] = await Promise.all([
    // 1. Invoices EMITIDA
    fetchAll<any>((f, t) => supabase
      .from('invoices')
      .select('invoice_number, total_amount, issue_date, client_name, client_nit, dian_status, credit_note_id, credit_note_number, trips(freight_value, clients(name, nit))')
      .eq('invoice_type', 'EMITIDA')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .order('id', { ascending: true }).range(f, t)),

    // 2. All bank transactions for the year (we filter server-side)
    fetchAll<any>((f, t) => supabase
      .from('bank_transactions')
      .select('id, type, amount, date, description, supplier_name, supplier_nit, category, category_id, account_id, transaction_categories(puc_code, name)')
      .gte('date', from)
      .lte('date', to)
      .order('id', { ascending: true }).range(f, t)),

    // 3. Legalization expenses with vehicle chain
    fetchAll<any>((f, t) => supabase
      .from('legalization_expenses')
      .select(`
        expense_type, amount, description, date,
        legalizations(
          trips(
            vehicles(plate)
          )
        )
      `)
      .gte('date', from)
      .lte('date', to)
      .order('id', { ascending: true }).range(f, t)),

    // 4. Toll transactions (Flypass)
    fetchAll<any>((f, t) => supabase
      .from('toll_transactions')
      .select('plate, total, pass_date')
      .gte('pass_date', from + 'T00:00:00')
      .lte('pass_date', to + 'T23:59:59')
      .order('id', { ascending: true }).range(f, t)),

    // 5. Terceros conocidos (para resolver anticipos sin supplier_name)
    supabase.from('clients').select('name, nit'),
    supabase.from('supplier_catalog').select('nombre, nit'),
  ])

  // ── Pre-process invoices ───────────────────────────────────────────────────
  const invoices: RawInvoice[] = (invoiceRows)
    .map((inv: any) => {
      const month = toMonth(inv.issue_date)
      if (!month) return null
      // Factura anulada (dian_status ANULADA o con nota crédito) → no suma como ingreso (neto $0)
      if (inv.dian_status === 'ANULADA' || inv.credit_note_id || inv.credit_note_number) return null
      const amount =
        Number(inv.total_amount ?? 0) ||
        Number(inv.trips?.freight_value ?? 0)
      const clientName = inv.client_name ?? inv.trips?.clients?.name ?? '—'
      const clientNit  = inv.client_nit  ?? inv.trips?.clients?.nit  ?? null
      return { month, clientName, clientNit, invoiceNumber: inv.invoice_number ?? null, amount }
    })
    .filter(Boolean) as RawInvoice[]

  const esAnulada = (i: any) => i.dian_status === 'ANULADA' || i.credit_note_id || i.credit_note_number
  console.log('Facturas EMITIDA leídas de la BD (año', year + '):', (invoiceRows).length,
    ((invoiceRows) as any[]).map(i => `${i.invoice_number}${esAnulada(i) ? '(anulada)' : ''}`))
  console.log('Facturas encontradas para Estado de Resultados:', invoices.length, invoices.map(f => f.invoiceNumber))

  // ── Pre-process bank transactions ─────────────────────────────────────────
  // El PUC efectivo de una transacción sale del category_id (FK a transaction_categories),
  // que es la clasificación AUTORITATIVA. El campo `category` (texto) está denormalizado y
  // suele quedar como 'SIN_CLASIFICAR' o con un PUC viejo aunque el category_id ya apunte a
  // la categoría correcta → priorizar el join evita perder esas transacciones (p.ej. 151
  // registros con category='SIN_CLASIFICAR' pero category_id válido, incluidos ~49 anticipos).
  function pickPuc(tx: any): string | null {
    const joined = (tx.transaction_categories as any)?.puc_code as string | null | undefined
    if (joined) return joined
    const text = (tx.category as string | null) ?? null
    return text && text !== 'SIN_CLASIFICAR' ? text : null
  }

  function extractBankTx(cats: string[], txType?: 'INGRESO' | 'EGRESO'): RawTx[] {
    return (bankTxRows)
      .filter((t: any) => {
        const puc = pickPuc(t)
        if (!puc || puc === PEAJE_PUC_EXCLUIDO) return false // peajes → toll_transactions, no banco
        if (!cats.includes(puc)) return false
        if (txType && t.type !== txType) return false
        return true
      })
      .map((t: any) => {
        const month = toMonth(t.date as string)
        if (!month) return null
        return {
          id:           t.id as string,
          month,
          date:         (t.date as string) ?? null,
          pucCode:      pickPuc(t)!,
          description:  t.description ?? null,
          supplierName: t.supplier_name ?? null,
          categoryId:   (t.category_id as string | null) ?? null,
          categoryName: (t.transaction_categories as any)?.name ?? null,
          amount:       Number(t.amount ?? 0),
        }
      })
      .filter(Boolean) as RawTx[]
  }

  // ── Anticipos: agrupar SOLO por NIT (nombre desde clients/supplier_catalog) o
  //    supplier_name exacto. Sin matching heurístico por descripción (falsos positivos). ──
  const digitsNit = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
  const knownByNit = new Map<string, string>()
  for (const c of (clientsRes.data ?? []) as any[]) if (c.nit && c.name && !knownByNit.has(digitsNit(c.nit))) knownByNit.set(digitsNit(c.nit), c.name)
  for (const s of (supRes.data ?? []) as any[]) if (s.nit && s.nombre && !knownByNit.has(digitsNit(s.nit))) knownByNit.set(digitsNit(s.nit), s.nombre)

  // Busca el nombre por NIT, tolerando el dígito de verificación (900941508 vs 9009415081)
  const lookupName = (nit: string): string | null => {
    const x = digitsNit(nit)
    if (!x) return null
    if (knownByNit.has(x)) return knownByNit.get(x)!
    for (const [k, name] of knownByNit) {
      if (Math.min(k.length, x.length) >= 8 && (x.startsWith(k) || k.startsWith(x))) return name
    }
    return null
  }

  function resolveCliente(supName: string | null, supNit: string | null): { name: string; nit: string | null } {
    const nit = supNit?.trim() || null
    if (nit) return { name: lookupName(nit) ?? (supName?.trim() || nit), nit }
    if (supName && supName.trim()) return { name: supName.trim(), nit: null }
    return { name: 'Sin cliente asignado', nit: null }
  }

  const anticipos: RawAnticipo[] = (bankTxRows)
    .filter((t: any) => pickPuc(t) === '28050510' && t.type === 'INGRESO')
    .map((t: any) => {
      const month = toMonth(t.date as string)
      if (!month) return null
      const cli = resolveCliente(t.supplier_name ?? null, t.supplier_nit ?? null)
      return { month, amount: Number(t.amount ?? 0), description: t.description ?? null, clientName: cli.name, clientNit: cli.nit }
    })
    .filter(Boolean) as RawAnticipo[]

  // ── Reversión de anticipos contra facturación (por cliente y mes) ───────────
  // Al facturar a un cliente, el anticipo que ya se contó como ingreso cuando se
  // recibió se "revierte" (valor negativo) en el mes de la factura, para no duplicar
  // el ingreso. El disponible de anticipos se acumula y se reduce mes a mes.
  const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const normName = (s: string | null | undefined) =>
    stripAccents(String(s ?? '')).toUpperCase()
      .replace(/[.,]/g, '')
      .replace(/\b(SAS|SA|LTDA|EU|SCA|SENC|CIA)\b/g, '')
      .replace(/\s+/g, ' ').trim()
  const fmtInv = (n: string) => n.replace(/^([A-Za-z]+)-?0*(\d+)$/, '$1-$2')

  // Facturas agrupadas por cliente (clave canónica: NIT en dígitos, sino nombre normalizado)
  type FactRec = { name: string; nit: string | null; months: number[]; invNums: string[][] }
  const factByClient = new Map<string, FactRec>()
  const nitToKey  = new Map<string, string>()
  const nameToKey = new Map<string, string>()
  for (const inv of invoices) {
    const d  = digitsNit(inv.clientNit)
    const nm = normName(inv.clientName)
    const key = d || nm || inv.clientName
    let rec = factByClient.get(key)
    if (!rec) {
      rec = { name: inv.clientName, nit: inv.clientNit, months: Array(13).fill(0), invNums: Array.from({ length: 13 }, () => [] as string[]) }
      factByClient.set(key, rec)
    }
    if (!rec.nit && inv.clientNit) rec.nit = inv.clientNit
    rec.months[inv.month] += inv.amount
    if (inv.invoiceNumber) rec.invNums[inv.month].push(inv.invoiceNumber)
    if (d)  nitToKey.set(d, key)
    if (nm) nameToKey.set(nm, key)
  }

  // Casar cada anticipo con un cliente facturado: por NIT (tolerando el dígito de
  // verificación) y, si el anticipo no trae NIT, por nombre normalizado.
  const findFactKey = (nit: string | null, name: string): string | null => {
    const d = digitsNit(nit)
    if (d && nitToKey.has(d)) return nitToKey.get(d)!
    if (d) for (const [k, key] of nitToKey) if (Math.min(k.length, d.length) >= 8 && (d.startsWith(k) || k.startsWith(d))) return key
    const nm = normName(name)
    if (nm && nameToKey.has(nm)) return nameToKey.get(nm)!
    return null
  }
  const antByClient = new Map<string, { arr: number[]; nit: string | null; name: string }>()
  for (const a of anticipos) {
    const key = findFactKey(a.clientNit, a.clientName)
    if (!key) continue                       // anticipo de cliente sin facturas → no se revierte
    let rec = antByClient.get(key)
    if (!rec) { rec = { arr: Array(13).fill(0), nit: a.clientNit, name: a.clientName }; antByClient.set(key, rec) }
    if (!rec.nit && a.clientNit) rec.nit = a.clientNit
    rec.arr[a.month] += a.amount
  }

  // Aplicar en cascada mes a mes: revertir MIN(facturado_mes, anticipo_disponible_acumulado)
  const reversas: RawAnticipo[] = []
  for (const [key, rec] of factByClient) {
    const ant = antByClient.get(key)
    if (!ant) continue
    let disponible = 0
    for (let m = 1; m <= 12; m++) {
      disponible += ant.arr[m]               // anticipos recibidos hasta este mes (acumulado)
      const fact = rec.months[m]
      if (fact > 0 && disponible > 0) {
        const revert = Math.min(fact, disponible)
        disponible -= revert
        const nums = rec.invNums[m].map(fmtInv)
        const label = nums.length ? `Aplicado a facturación ${nums.join(', ')}` : `Aplicado a facturación ${rec.name}`
        // Se agrupa bajo el mismo cliente que los anticipos (clientNit/Name del anticipo)
        reversas.push({ month: m, amount: -revert, description: label, clientName: ant.name, clientNit: ant.nit })
      }
    }
  }
  console.log('Reversas de anticipos aplicadas:', reversas.length,
    reversas.map(r => `${r.clientName} m${r.month} ${r.amount.toLocaleString()}`))
  const anticiposConReversas: RawAnticipo[] = [...anticipos, ...reversas]

  const personalCosts  = extractBankTx(PERSONAL_COST_CATS, 'EGRESO')
  const generalCosts   = extractBankTx(GENERAL_COST_CATS, 'EGRESO')
  const financialExps  = extractBankTx(FINANCIAL_EXP_CATS, 'EGRESO')
  const financialIncs  = extractBankTx(FINANCIAL_INC_CATS, 'INGRESO')
  const taxes          = extractBankTx(TAX_CATS, 'EGRESO')
  const personalOwner  = extractBankTx(PERSONAL_OWNER_CATS, 'EGRESO')
  const anticiposNoLeg = extractBankTx(ANTICIPO_NO_LEG_CATS)

  // ── Transacciones sin clasificar (category_id null) ────────────────────────
  const sinClasificar: SinClasificar[] = (bankTxRows)
    .filter((t: any) => !t.category_id)
    .map((t: any) => {
      const month = toMonth(t.date as string)
      if (!month) return null
      return {
        id:          t.id as string,
        month,
        date:        (t.date as string) ?? null,
        description: t.description ?? null,
        amount:      Number(t.amount ?? 0),
        type:        (t.type as 'INGRESO' | 'EGRESO'),
      }
    })
    .filter(Boolean) as SinClasificar[]
  // Cuenta con más transacciones sin clasificar (para el link "Ir a clasificar")
  const accCount: Record<string, number> = {}
  for (const t of (bankTxRows) as any[]) if (!t.category_id && t.account_id) accCount[t.account_id] = (accCount[t.account_id] ?? 0) + 1
  const sinClasificarAccountId = Object.entries(accCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // ── Pre-process legalization expenses ─────────────────────────────────────
  const legExps: RawLegExp[] = (legExpRows)
    .map((e: any) => {
      const month = toMonth(e.date)
      if (!month || !e.amount) return null
      const leg     = e.legalizations
      const trip    = leg?.trips
      const vehicle = trip?.vehicles
      return {
        month,
        plate:       (vehicle?.plate as string | null) ?? null,
        expenseType: e.expense_type as string ?? 'otros',
        amount:      Number(e.amount),
        description: e.description ?? null,
      }
    })
    .filter(Boolean) as RawLegExp[]

  // ── Pre-process tolls ─────────────────────────────────────────────────────
  const tolls: RawToll[] = (tollRows)
    .map((t: any) => {
      const month = toMonth(t.pass_date as string)
      if (!month) return null
      return { month, plate: (t.plate as string | null) ?? null, amount: Number(t.total ?? 0) }
    })
    .filter(Boolean) as RawToll[]

  const currentYear    = new Date().getFullYear()
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const pylData: PYLData = {
    year, availableYears,
    invoices, anticipos: anticiposConReversas, legExps, tolls,
    personalCosts, generalCosts, financialExps, financialIncs,
    taxes, personalOwner, anticiposNoLeg,
    sinClasificar, sinClasificarAccountId,
  }

  return <EstadoResultadosClient {...pylData} />
}
