// Cálculo del impuesto SIMPLE por bimestre a partir del LIBRO (journal_entry_lines).
// Funciones puras: la página las alimenta con líneas ya leídas; no tocan la base de datos.
//
// Fuentes (todas contabilizadas):
//   · Ingreso del bimestre  = Σ (crédito − débito) de las cuentas 41xx por fecha del asiento
//                             (ya neto de notas crédito: la NC debita 41450510).
//   · Pensión empresa       = Σ débito de 52057010 (nómina mensual).
//   · Causado               = créditos a 241215 (CG de causación) asignados al bimestre por fecha;
//                             se separa nacional (54050505) e ICA (54050510) con los débitos de esas cuentas.
//   · Pagado                = débitos a 241215 aplicados en orden cronológico (FIFO) al impuesto más antiguo.
//     El saldo inicial de la apertura (CA) es el primer cubo y se paga antes que cualquier bimestre.

export type LineaImpuesto = {
  cuenta: string
  fecha: string          // YYYY-MM-DD del asiento
  tipo: string           // tipo_comprobante
  debito: number
  credito: number
}

export type EstadoImpuesto = 'SIN_CAUSAR' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO'

export type BimestreLibro = {
  num: number                       // 1..6
  ingreso: number
  pension: number
  nacional: number                  // causado, componente nacional
  ica: number                       // causado, ICA
  causado: number                   // total acreditado a 241215 en el bimestre
  pagado: number
  saldo: number                     // causado − pagado
  ultimoPago: string | null         // fecha del último pago aplicado
  estado: EstadoImpuesto
}

export type ResultadoImpuesto = {
  bimestres: BimestreLibro[]
  aperturaSaldo: number             // saldo inicial 241215 (CA) aún sin pagar
  saldo241215: number               // saldo total del pasivo (CR − DB), todos los años
}

export function bimestreDeFecha(fecha: string): { anio: number; num: number } {
  const anio = Number(fecha.slice(0, 4))
  const mes  = Number(fecha.slice(5, 7))
  return { anio, num: Math.ceil(mes / 2) }
}

const clave = (anio: number, num: number) => anio * 10 + num   // ordenable cronológicamente
const APERTURA = 0

type Cubo = { causado: number; pagado: number; ultimoPago: string | null }

export function calcularImpuestoLibro(
  year: number,
  lineas: LineaImpuesto[],          // 41xx, 52057010, 54050505, 54050510 y 241215 (todos los años)
): ResultadoImpuesto {
  const bimestres: BimestreLibro[] = Array.from({ length: 6 }, (_, i) => ({
    num: i + 1, ingreso: 0, pension: 0, nacional: 0, ica: 0,
    causado: 0, pagado: 0, saldo: 0, ultimoPago: null, estado: 'SIN_CAUSAR' as EstadoImpuesto,
  }))

  const cubos = new Map<number, Cubo>()
  const cubo = (k: number) => {
    let c = cubos.get(k)
    if (!c) { c = { causado: 0, pagado: 0, ultimoPago: null }; cubos.set(k, c) }
    return c
  }
  const pagos: { fecha: string; monto: number }[] = []
  let saldo241215 = 0

  for (const l of lineas) {
    const { anio, num } = bimestreDeFecha(l.fecha)
    const enAnio = anio === year
    const idx = num - 1

    if (l.cuenta.startsWith('41')) {
      if (enAnio) bimestres[idx].ingreso += l.credito - l.debito
    } else if (l.cuenta === '52057010') {
      if (enAnio) bimestres[idx].pension += l.debito - l.credito
    } else if (l.cuenta === '54050505') {
      if (enAnio) bimestres[idx].nacional += l.debito - l.credito
    } else if (l.cuenta === '54050510') {
      if (enAnio) bimestres[idx].ica += l.debito - l.credito
    } else if (l.cuenta === '241215') {
      saldo241215 += l.credito - l.debito
      if (l.tipo === 'CA') {
        cubo(APERTURA).causado += l.credito - l.debito
      } else if (l.tipo === 'RV') {
        cubo(clave(anio, num)).causado += l.credito - l.debito      // reversión: ajusta el cubo de su fecha
      } else {
        cubo(clave(anio, num)).causado += l.credito                  // causación
        if (l.debito > 0) pagos.push({ fecha: l.fecha, monto: l.debito })   // pago (CB/CG) → FIFO
      }
    }
  }

  // FIFO: cada pago cancela el cubo con causación pendiente más antiguo.
  const orden = [...cubos.keys()].sort((a, b) => a - b)
  for (const p of pagos.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    let resto = p.monto
    for (const k of orden) {
      if (resto <= 0) break
      const c = cubos.get(k)!
      const pendiente = c.causado - c.pagado
      if (pendiente <= 0) continue
      const aplica = Math.min(pendiente, resto)
      c.pagado += aplica
      c.ultimoPago = p.fecha
      resto -= aplica
    }
  }

  for (const b of bimestres) {
    const c = cubos.get(clave(year, b.num))
    b.causado    = c?.causado ?? 0
    b.pagado     = c?.pagado ?? 0
    b.ultimoPago = c?.ultimoPago ?? null
    b.saldo      = b.causado - b.pagado
    b.estado     = b.causado <= 0 ? 'SIN_CAUSAR'
                 : b.saldo <= 0   ? 'PAGADO'
                 : b.pagado > 0   ? 'PARCIAL'
                 :                  'PENDIENTE'
  }

  const ap = cubos.get(APERTURA)
  return { bimestres, aperturaSaldo: ap ? ap.causado - ap.pagado : 0, saldo241215 }
}
