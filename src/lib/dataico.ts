const BASE = 'https://api.dataico.com/direct/dataico_api/v2'

function authHeaders() {
  console.log('DATAICO_ACCOUNT_ID:', process.env.DATAICO_ACCOUNT_ID)
  console.log('DATAICO_AUTH_TOKEN:', process.env.DATAICO_AUTH_TOKEN?.substring(0, 10))
  return {
    'Auth-token':          process.env.DATAICO_AUTH_TOKEN!,
    'dataico_account_id':  process.env.DATAICO_ACCOUNT_ID!,
    'Content-Type':        'application/json',
  }
}

export type DataicoCustomer = {
  id:                        string
  company_name:              string
  party_identification:      string
  party_identification_type: string
  party_type:                string
  tax_level_code:            string
  email?:                    string
  phone?:                    string
  updated_at:                string
}

export async function getDataicoCustomers(): Promise<DataicoCustomer[]> {
  const res = await fetch(`${BASE}/customers`, {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dataico ${res.status}: ${text}`)
  }
  const json = await res.json()
  return (json.customers ?? []) as DataicoCustomer[]
}

export type DataicoInvoiceItem = {
  sku:         string
  description: string
  price:       number
  quantity:    number
  discount?:   number
}

export type DataicoInvoice = {
  uuid:              string
  number:            string
  cufe:              string
  issue_date:        string
  validation_date:   string
  dian_status:       string
  invoice_type_code: string
  payment_means:     string
  payment_means_type: string
  notes:             string[]
  customer: {
    company_name:              string
    party_identification:      string
    party_identification_type: string
    party_type:                string
    tax_level_code:            string
    email?:                    string
  }
  items:    DataicoInvoiceItem[]
  pdf_url:  string
  xml_url:  string
  qrcode:   string
}

/**
 * Fetch one invoice by its number (prefix concatenated with consecutive, no hyphen).
 * E.g. prefix "FEIT" + consecutive "10" → number "FEIT10"
 */
export async function getDataicoInvoice(number: string): Promise<DataicoInvoice | null> {
  const normalized = number.replace('-', '')
  const res = await fetch(`${BASE}/invoices?number=${encodeURIComponent(normalized)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dataico ${res.status}: ${text}`)
  }
  const json = await res.json()
  return (json.invoice ?? null) as DataicoInvoice | null
}

/** Parse Colombian NIT into base digits and DV. Handles "901050139-3" or "901050139". */
export function parseNIT(raw: string): { base: string; dv: string } {
  const cleaned = (raw ?? '').replace(/\./g, '').replace(/\s/g, '')
  if (cleaned.includes('-')) {
    const [base, dv] = cleaned.split('-')
    return { base: base.trim(), dv: (dv ?? '0').trim() }
  }
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const digits = cleaned.split('').map(Number).reverse()
  let sum = 0
  for (let i = 0; i < digits.length; i++) sum += digits[i] * weights[i]
  const rem = sum % 11
  return { base: cleaned, dv: rem <= 1 ? String(rem) : String(11 - rem) }
}

/** Find a Dataico customer by NIT from the customer list. */
export async function findDataicoCustomer(nit: string): Promise<DataicoCustomer | null> {
  const customers = await getDataicoCustomers()
  return customers.find(c => c.party_identification === nit) ?? null
}

/** Create a new customer in Dataico. */
export async function createDataicoCustomer(params: {
  name: string
  nit: string
  dv: string
  email?: string
}): Promise<string> {
  const body = {
    company_name: params.name,
    party_identification: params.nit,
    party_identification_type: 'NIT',
    party_type: 'PERSONA_JURIDICA',
    tax_level_code: 'SIMPLIFICADO',
    ...(params.email ? { email: params.email } : {}),
  }
  const res = await fetch(`${BASE}/customers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dataico createCustomer ${res.status}: ${text}`)
  }
  const json = await res.json()
  return (json.customer?.id ?? json.id ?? '') as string
}

export type CreateInvoiceParams = {
  customerName: string
  customerNit: string
  customerEmail?: string
  date: string
  freightValue: number
  plate: string
  origin: string
  destination: string
  loadContent?: string
  weightKg?: number
  pricePerTon?: number
  manifestNumber?: string
}

/** POST /invoices — create a new electronic invoice in Dataico. */
export async function createDataicoInvoice(params: CreateInvoiceParams): Promise<DataicoInvoice> {
  const noteParts = [
    params.plate,
    `${params.origin} ${params.destination}`,
    params.loadContent ?? 'Carga general',
    params.weightKg   != null ? `Peso ${params.weightKg}`       : null,
    params.pricePerTon != null ? `Flete ${params.pricePerTon}`  : null,
    String(params.freightValue),
    params.manifestNumber ? `Manifiesto ${params.manifestNumber}` : null,
  ].filter(Boolean)

  const body = {
    dataico_account_id: process.env.DATAICO_ACCOUNT_ID,
    send_dian: false,
    number_template: {
      prefix:            process.env.DATAICO_PREFIX ?? 'FEIT',
      resolution_number: process.env.DATAICO_RESOLUTION_NUMBER ?? '',
      resolution_date:   process.env.DATAICO_RESOLUTION_DATE   ?? '',
      technical_key:     '',
      from:              Number(process.env.DATAICO_FROM ?? 1),
      to:                Number(process.env.DATAICO_TO   ?? 1000),
      next_consecutive:  11,
    },
    customer: {
      name: params.customerName,
      identification_number: params.customerNit,
      company: true,
      ...(params.customerEmail ? { email: params.customerEmail } : {}),
    },
    date: params.date,
    due_date: params.date,
    payment_means: '1',
    payment_means_type: '42',
    items: [{
      sku: '01',
      description: 'Servicio de transporte',
      price: params.freightValue,
      quantity: 1,
      tax_iva: 0,
      tax_ica: 0,
      tax_consumption: 0,
    }],
    notes: [noteParts.join(' - ')],
  }

  const payload = { invoice: body }
  console.log('DATAICO PAYLOAD:', JSON.stringify(payload, null, 2))

  const res = await fetch(`${BASE}/invoices`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  console.log('DATAICO STATUS:', res.status)
  const responseText = await res.text()
  console.log('DATAICO RESPONSE:', responseText)

  if (!res.ok) {
    throw new Error(`Dataico createInvoice ${res.status}: ${responseText}`)
  }
  const json = JSON.parse(responseText)
  return json.invoice as DataicoInvoice
}
