// Verificación: genera el Excel de reportes de un periodo con el MISMO lib que usa la
// pantalla (construirWorkbookContador) y LEE el archivo para confirmar la portada (v2.0 +
// marca PRELIMINAR). Uso:  npx tsx scripts/dev/verificar-reporte-excel.ts [YYYY-MM] [out.xlsx]
import { readFileSync, existsSync } from 'fs'

// Cargar env ANTES de importar los libs (que leen process.env al cargarse).
const envFile = existsSync('.env.local') ? '.env.local' : '.env'
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  if (!line.includes('=')) continue
  const i = line.indexOf('='); const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  if (!process.env[k]) process.env[k] = v
}

async function main() {
  const periodo = process.argv[2] || '2026-09'
  const out = process.argv[3] || `_reporte_${periodo}_verif.xlsx`

  const { reportesContador } = await import('../../src/lib/contabilidad-reportes')
  const { construirWorkbookContador, REPORTE_VERSION, PRELIMINAR_MARCA } = await import('../../src/lib/contabilidad-reportes-excel')

  const data = await reportesContador(periodo)
  // Mismos cruces que calcula la pantalla
  const totD = data.balance.reduce((s, b) => s + b.debitoPeriodo, 0)
  const totC = data.balance.reduce((s, b) => s + b.creditoPeriodo, 0)
  const balance = Math.abs(totD - totC) < 0.01
  const activo = data.esf.totalActivo
  const esf = Math.abs(activo - (data.esf.totalPasivo + data.esf.totalPatrimonio + data.esf.utilidad)) < 0.01
  const eri = Math.abs(data.eri.utilidadAcumulada - data.esf.utilidad) < 0.01
  const mayorBy = new Map(data.mayor.map(c => [c.cuenta, c.saldoFinal]))
  const mayor = data.balance.every(b => Math.abs((mayorBy.get(b.cuenta) ?? 0) - b.saldoFinal) < 0.01)

  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
  const wb: any = await construirWorkbookContador(data, generado, { balance, mayor, esf, eri, totD, activo, utilidad: data.esf.utilidad })
  await wb.xlsx.writeFile(out)
  console.log(`Generado: ${out}  (periodo ${periodo}, hojas: ${wb.worksheets.map((w: any) => w.name).join(', ')})`)

  // LEER el archivo recién escrito y mostrar la portada
  const ExcelJS: any = await import('exceljs')
  const Wb = ExcelJS.Workbook ?? ExcelJS.default?.Workbook
  const rb = new Wb()
  await rb.xlsx.readFile(out)
  const port = rb.getWorksheet('Portada')
  console.log('\n──── PORTADA (leída del archivo) ────')
  let vioVersion = false, vioPrelim = false, vioPeriodo = false
  port.eachRow((row: any) => {
    const vals = (row.values as any[]).slice(1).map(v => (v == null ? '' : String(v))).filter(Boolean)
    if (vals.length) console.log('  ' + vals.join('  |  '))
    const joined = vals.join(' ')
    if (joined.includes('Versión del formato') && vals.includes(REPORTE_VERSION)) vioVersion = true
    if (joined.includes(PRELIMINAR_MARCA)) vioPrelim = true
    if (/Septiembre de 2026/i.test(joined)) vioPeriodo = true
  })
  console.log('\n──── VERIFICACIÓN ────')
  console.log(`  Versión = ${REPORTE_VERSION} en portada: ${vioVersion ? '✓' : '✗'}`)
  console.log(`  Marca "${PRELIMINAR_MARCA}" en portada: ${vioPrelim ? '✓' : '✗'}`)
  console.log(`  Periodo Septiembre de 2026 en portada: ${vioPeriodo ? '✓' : '✗'}`)
  // confirmar que también aparece en la fila 5 de una hoja de datos
  const esf2 = rb.getWorksheet('ESF')
  const r5 = (esf2.getRow(5).values as any[]).slice(1).map((v: any) => v == null ? '' : String(v)).join(' ')
  console.log(`  Fila 5 de hoja ESF: "${r5.trim()}" ${r5.includes(PRELIMINAR_MARCA) ? '✓ (marca también en hojas)' : ''}`)
}

main().catch(e => { console.error(e); process.exit(1) })
