// Cartera y anticipos de clientes leídos del LIBRO (no de tablas paralelas).
// Funciones puras: la página las alimenta con líneas ya leídas de journal_entry_lines.
//
// Regla contable de las dos cuentas:
//   · 28050510 Anticipos de clientes (pasivo):  entra por RC (crédito) cuando el cliente consigna;
//     sale por CX (débito) cuando el cruce lo aplica a una factura.
//   · 13050501 Cartera facturada (activo):      entra por CF (débito) con la FE verificada;
//     baja por CX (crédito) al cruzar con el anticipo, y por NC (crédito) con la nota crédito.
//   Saldo anticipo = crédito − débito de 28050510 · Saldo cartera = débito − crédito de 13050501.
//   Facturado neto = CF − NC sobre 13050501.

export type LineaCartera = {
  cuenta: string            // '28050510' | '13050501'
  fecha: string             // YYYY-MM-DD del asiento
  tipo: string              // tipo_comprobante
  debito: number
  credito: number
  terceroId: string | null
  nombre: string
  nit: string | null
}

export type FilaCartera = {
  clave: string             // terceroId o 'SIN_TERCERO'
  terceroId: string | null
  nombre: string
  nit: string | null
  anticipoSaldo: number     // anticipo del cliente aún sin aplicar
  carteraSaldo: number      // facturado pendiente de cobro
  recibidoAnio: number      // consignaciones del año (RC)
  facturadoAnio: number     // facturado neto del año (CF − NC)
  porMes: number[]          // facturado neto por mes (índice 0 = enero)
}

export type ResumenCartera = {
  filas: FilaCartera[]
  anticipoTotal: number
  carteraTotal: number
  recibidoAnio: number
  facturadoAnio: number
  porMesTotal: number[]
}

export function resumirCartera(year: number, lineas: LineaCartera[]): ResumenCartera {
  const mapa = new Map<string, FilaCartera>()
  const fila = (l: LineaCartera): FilaCartera => {
    const clave = l.terceroId ?? 'SIN_TERCERO'
    let f = mapa.get(clave)
    if (!f) {
      f = {
        clave, terceroId: l.terceroId, nombre: l.nombre || '— sin tercero —', nit: l.nit,
        anticipoSaldo: 0, carteraSaldo: 0, recibidoAnio: 0, facturadoAnio: 0,
        porMes: new Array(12).fill(0),
      }
      mapa.set(clave, f)
    }
    return f
  }

  for (const l of lineas) {
    const f = fila(l)
    const enAnio = l.fecha.startsWith(`${year}-`)
    const mes = Number(l.fecha.slice(5, 7)) - 1
    if (l.cuenta === '28050510') {
      f.anticipoSaldo += l.credito - l.debito
      if (enAnio && l.tipo === 'RC') f.recibidoAnio += l.credito
    } else if (l.cuenta === '13050501') {
      f.carteraSaldo += l.debito - l.credito
      if (enAnio && (l.tipo === 'CF' || l.tipo === 'NC')) {
        const neto = l.debito - l.credito
        f.facturadoAnio += neto
        f.porMes[mes] += neto
      }
    }
  }

  const filas = [...mapa.values()]
    .filter(f => f.anticipoSaldo !== 0 || f.carteraSaldo !== 0 || f.facturadoAnio !== 0 || f.recibidoAnio !== 0)
    .sort((a, b) => b.facturadoAnio - a.facturadoAnio || Math.abs(b.anticipoSaldo) - Math.abs(a.anticipoSaldo))

  const sum = (g: (f: FilaCartera) => number) => filas.reduce((s, f) => s + g(f), 0)
  return {
    filas,
    anticipoTotal: sum(f => f.anticipoSaldo),
    carteraTotal: sum(f => f.carteraSaldo),
    recibidoAnio: sum(f => f.recibidoAnio),
    facturadoAnio: sum(f => f.facturadoAnio),
    porMesTotal: Array.from({ length: 12 }, (_, m) => sum(f => f.porMes[m])),
  }
}
