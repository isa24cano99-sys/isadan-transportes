/**
 * Fechas en hora Colombia (America/Bogota, UTC-5, sin DST).
 *
 * Vercel corre en UTC: `new Date().toISOString().slice(0,10)` devuelve el día
 * SIGUIENTE entre las 19:00 y 23:59 hora Colombia. En contabilidad eso mete un
 * movimiento en el mes (o bimestre) equivocado. Usar SIEMPRE estas funciones
 * para calcular "hoy" o convertir un instante a fecha de negocio.
 *
 * Se usa Intl con locale 'en-CA', que formatea directamente como 'YYYY-MM-DD'.
 * NO reconstruir el string con getFullYear/getMonth/getDate: esos usan la TZ del
 * proceso (UTC en el servidor), que es justo el bug que esto corrige.
 */

const FECHA_CO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Fecha de HOY en Colombia, formato 'YYYY-MM-DD'. */
export function hoyColombia(): string {
  return FECHA_CO.format(new Date())
}

/** Convierte un instante (Date) a su fecha de calendario en Colombia, 'YYYY-MM-DD'. */
export function aFechaColombia(d: Date): string {
  return FECHA_CO.format(d)
}

/**
 * Instante actual como Date (absoluto/UTC, TZ-agnóstico). Úsalo para timestamps
 * (`created_at`, `paid_at`…). Para obtener una FECHA de calendario colombiana usa
 * `aFechaColombia(ahoraColombia())` — nunca `getFullYear/getMonth` sobre este Date.
 */
export function ahoraColombia(): Date {
  return new Date()
}
