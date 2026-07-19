import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date))
}

/**
 * Display-only formatter for invoice numbers. Stored form is ALWAYS without a
 * dash (e.g. 'FEIT12'); this inserts the dash for the user ('FEIT12' → 'FEIT-12').
 * Idempotent: already-dashed or non-matching values are handled gracefully.
 */
export function formatInvoiceNumber(n: string | null | undefined): string {
  if (!n) return '—'
  return String(n).replace(/-/g, '').replace(/^([A-Za-z]+)(\d+)$/, '$1-$2')
}

type TripLike = {
  trip_number?:     string | null
  manifest_number?: string | null
  manifest_auth?:   string | null
  origin?:          string | null
  destination?:     string | null
  load_date?:       string | null
  plate?:           string | null
  vehicles?:        { plate?: string | null } | null
}

/**
 * Identificador de viaje priorizando el manifiesto:
 * manifest_number → manifest_auth → trip_number → '—'.
 */
export function tripManifiesto(t: TripLike | null | undefined): string {
  if (!t) return '—'
  return (t.manifest_number ?? '').trim()
      || (t.manifest_auth ?? '').trim()
      || (t.trip_number ?? '').trim()
      || '—'
}

/**
 * Etiqueta de un viaje para los selectores: muestra el número de manifiesto
 * (o el trip_number como fallback) + placa · ruta · fecha.
 *   '[MAN30515] TSV130 · Bello → Valledupar · 20/06/2026'
 *   '[VJ-0001] TSV130 · Bello → Valledupar · 20/06/2026'  (sin manifiesto)
 */
export function formatTripOption(t: TripLike): string {
  const code  = (t.manifest_number ?? '').trim() || t.trip_number || '—'
  const plate = t.plate ?? t.vehicles?.plate ?? ''
  const route = [t.origin, t.destination].filter(Boolean).join(' → ')
  const fecha = t.load_date ? formatDate(t.load_date) : ''
  let s = `[${code}]`
  if (plate) s += ` ${plate}`
  const tail = [route, fecha].filter(Boolean).join(' · ')
  if (tail) s += ` · ${tail}`
  return s
}

/** ¿El viaje coincide con la búsqueda? Filtra por manifiesto, trip_number, placa y ruta. */
export function tripMatchesQuery(t: TripLike, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [t.manifest_number, t.trip_number, t.plate ?? t.vehicles?.plate, t.origin, t.destination]
    .filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q)
}

/**
 * Interpreta el balance de una legalización. `balance = anticipo − gastos`.
 * - balance > 0 (sobró anticipo) → el conductor debe a la empresa (ROJO).
 * - balance < 0 (gastos > anticipo) → la empresa debe al conductor (VERDE).
 * Fuente única de verdad para la lista y el detalle.
 */
export function legalizacionBalance(balance: number): {
  label: string        // largo, p. ej. detalle
  shortLabel: string   // corto, p. ej. lista
  colorClass: string
} {
  if (balance > 0) return { label: 'Conductor debe a empresa', shortLabel: 'cond. debe', colorClass: 'text-red-600' }
  if (balance < 0) return { label: 'Empresa debe al conductor', shortLabel: 'emp. debe',  colorClass: 'text-green-700' }
  return { label: 'Cuadrado', shortLabel: '', colorClass: 'text-[#64748B]' }
}
