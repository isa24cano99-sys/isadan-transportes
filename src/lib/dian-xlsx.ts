/**
 * Parseo compartido del reporte .xlsx de la DIAN (consulta de documentos, recibidas + emitidas).
 * Único punto de mapeo de columnas → DianRow, consumido por el import UNIFICADO en
 * /contabilidad/conciliacion-costos (un archivo, ambas direcciones: clasifica por grupo y
 * resuelve proveedor/cliente por NIT). No importa supabase — es client-safe (parseXlsx corre
 * en el navegador con File API).
 */
import * as XLSX from 'xlsx'

export type DianRow = {
  document_type: string; cufe: string; folio: string; prefix: string
  issue_date: string | null; reception_date: string | null
  nit_issuer: string; name_issuer: string; nit_receiver: string; name_receiver: string
  iva: number; total: number; status: string
}

function norm(s: string) { return s.trim().normalize('NFC') }

function getCol(row: Record<string, unknown>, ...names: string[]): string {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v !== undefined && v !== null && v !== '') return String(v).trim()
  }
  return ''
}

function getNum(row: Record<string, unknown>, ...names: string[]): number {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) r[norm(k)] = v
  for (const name of names) {
    const v = r[norm(name)]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') return isNaN(v) ? 0 : v
    const parsed = parseFloat(String(v).trim().replace(/[$\s.]/g, '').replace(',', '.'))
    if (!isNaN(parsed)) return parsed
  }
  return 0
}

function parseDianDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0]
  const s = String(val).trim()
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return s || null
}

export function mapDian(raw: Record<string, unknown>): DianRow {
  return {
    document_type:  getCol(raw, 'Tipo de documento', 'Tipo de Documento'),
    cufe:           getCol(raw, 'CUFE/CUDE', 'CUFE', 'CUDE'),
    folio:          getCol(raw, 'Folio'),
    prefix:         getCol(raw, 'Prefijo'),
    issue_date:     parseDianDate(raw['Fecha Emisión'] ?? raw['Fecha Emision'] ?? raw['Fecha de Emisión']),
    reception_date: parseDianDate(raw['Fecha Recepción'] ?? raw['Fecha Recepcion']),
    nit_issuer:     getCol(raw, 'NIT Emisor'),
    name_issuer:    getCol(raw, 'Nombre Emisor'),
    nit_receiver:   getCol(raw, 'NIT Receptor'),
    name_receiver:  getCol(raw, 'Nombre Receptor'),
    iva:            getNum(raw, 'IVA', 'Iva'),
    total:          getNum(raw, 'Total'),
    status:         getCol(raw, 'Estado'),
  }
}

export async function parseXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()
  const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}
