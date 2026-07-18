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
