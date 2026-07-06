const BASE = 'https://api.dataico.com/direct/dataico_api/v2'

function authHeaders() {
  return {
    'Auth-token':         process.env.DATAICO_AUTH_TOKEN!,
    'dataico_account_id': process.env.DATAICO_ACCOUNT_ID!,
    'Content-Type':       'application/json',
  }
}

/** Convert YYYY-MM-DD → DD/MM/YYYY as required by Dataico */
function toDataicoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
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
  sku:            string
  description:    string
  price:          number
  quantity:       number
  measuring_unit: string
  taxes?:         unknown[]
  retentions?:    unknown[]
}

export type DataicoInvoice = {
  uuid:               string
  number:             string
  cufe:               string
  issue_date:         string
  validation_date:    string
  dian_status:        string
  invoice_type_code:  string
  payment_means:      string
  payment_means_type: string
  notes:              string[]
  customer: {
    company_name:              string
    party_identification:      string
    party_identification_type: string
    party_type:                string
    tax_level_code:            string
    email?:                    string
  }
  items:   DataicoInvoiceItem[]
  pdf_url: string
  xml_url: string
  qrcode:  string
}

/**
 * Fetch one invoice by its number (prefix + consecutive, no separator).
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
    company_name:              params.name,
    party_identification:      params.nit,
    party_identification_type: 'NIT',
    party_type:                'PERSONA_JURIDICA',
    tax_level_code:            'SIMPLIFICADO',
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
  customerName:    string
  customerNit:     string
  customerEmail?:  string
  nextConsecutive: number
  date:            string   // YYYY-MM-DD
  freightValue:    number
  plate:           string
  origin:          string
  destination:     string
  loadContent?:    string
  weightKg?:       number
  pricePerTon?:    number
  manifestNumber?: string
}

/** POST /invoices — create a new electronic invoice in Dataico. */
export async function createDataicoInvoice(params: CreateInvoiceParams): Promise<DataicoInvoice> {
  const noteParts = [
    params.plate,
    `${params.origin} → ${params.destination}`,
    params.loadContent ?? 'Carga general',
    params.weightKg    != null ? `Peso ${params.weightKg} kg`      : null,
    params.pricePerTon != null ? `Flete ${params.pricePerTon}/ton` : null,
    params.manifestNumber ? `Manifiesto ${params.manifestNumber}`  : null,
  ].filter(Boolean)

  const issueDate = toDataicoDate(params.date)

  console.log('NEXT CONSECUTIVE:', params.nextConsecutive)

  const payload = {
    actions: {
      send_dian:  false,
      send_email: false,
    },
    invoice: {
      env:                process.env.DATAICO_ENV ?? 'PRODUCCION',
      number:             params.nextConsecutive,
      dataico_account_id: process.env.DATAICO_ACCOUNT_ID,
      issue_date:         issueDate,
      payment_date:       issueDate,
      invoice_type_code:  'FACTURA_VENTA',
      payment_means:      'DEBIT_AHORRO',
      payment_means_type: 'CREDITO',
      order_reference:    '',
      numbering: {
        resolution_number: process.env.DATAICO_RESOLUTION_NUMBER,
        prefix:            process.env.DATAICO_PREFIX,
        flexible:          true,
      },
      customer: {
        party_identification_type: 'NIT',
        party_identification:      params.customerNit,
        party_type:                'PERSONA_JURIDICA',
        tax_level_code:            'COMUN',
        regimen:                   'ORDINARIO',
        company_name:              params.customerName,
        first_name:                '',
        family_name:               '',
        department:                '05',
        city:                      '001',
        address_line:              'Colombia',
        country_code:              'CO',
        email:                     params.customerEmail ?? '',
        phone:                     '0',
      },
      items: [
        {
          sku:            '01',
          quantity:       1,
          description:    'Servicio de transporte',
          measuring_unit: '94',
          price:          params.freightValue,
          taxes:          [],
          retentions:     [],
        },
      ],
      notes: [noteParts.join(' - ')],
    },
  }

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

  if (!res.ok) throw new Error(`Dataico createInvoice ${res.status}: ${responseText}`)
  const data = JSON.parse(responseText)
  console.log('DATAICO RAW RESPONSE:', JSON.stringify(data, null, 2))
  return data as DataicoInvoice
}
