// Parser del texto crudo pegado desde el portal de manifiestos (alternativa al PDF).
// El texto son dos bloques concatenados sin separadores: las etiquetas van pegadas al
// valor ("Radicado121827336"). Estrategia: "caminata secuencial de anclas" — cada
// nombre de campo conocido es un ancla; se busca hacia ADELANTE desde la posición
// anterior (así los duplicados "Manifiesto"/"Valor Viaje" de los dos bloques no
// colisionan), y el valor es el texto entre el fin de un ancla y el inicio del
// siguiente ancla localizado. Probado 18/18 exacto contra un ejemplo real del portal.

// [ancla, clave] en el ORDEN en que aparecen. clave=null → separador/frontera que no se usa.
// 'Manifiesto de Carga' (encabezado) va primero → su valor es la placa. OJO: contiene la
// palabra 'Manifiesto', pero como la caminata es secuencial y esta ancla se consume antes
// de llegar al ancla 'Manifiesto' (MAN…), no colisionan. Si el texto no trae encabezado
// (formato viejo pegado), esta ancla simplemente no se encuentra y se salta sin romper nada.
const ANCLAS: [string, string | null][] = [
  ['Manifiesto de Carga', 'placa'],
  ['Origen', 'origen'], ['Destino', 'destino'], ['Empresa', 'empresa'], ['Conductor', 'conductor'],
  ['Radicado', 'radicado'], ['Manifiesto', 'manifiesto'], ['Fecha viaje', 'fecha_viaje'],
  ['Valor Viaje', 'valor_viaje'], ['Fecha aceptación', 'fecha_aceptacion'], ['Cumplido', 'cumplido'],
  ['Ver detalle y Aprobar', null], ['Producto:', 'producto'],
  ['Manifiesto', null], ['Fecha Viaje', null], ['Fecha Cumplido', 'fecha_cumplido'],
  ['Valor Viaje', null], ['Valor Adicional por Tiempos Logísticos', 'valor_adicional'],
  ['Valor a Disminuir por Tiempos Logísticos', 'valor_disminuir'], ['Valor a Pagar', 'valor_a_pagar'],
  ['Valor Anticipo', 'valor_anticipo'], ['Retención en la Fuente', 'reten_fuente'],
  ['Retención de ICA', 'reten_ica'], ['Saldo a Pagar', 'saldo_pagar'],
]

export type ManifiestoTexto = {
  placa: string | null
  producto: string | null
  origen: string | null
  destino: string | null
  empresa: string | null
  conductor_doc: string | null
  conductor_nombre: string | null
  radicado: string | null
  manifiesto: string | null
  fecha_viaje: string | null
  valor_viaje: string | null
  fecha_aceptacion: string | null
  cumplido: string | null
  fecha_cumplido: string | null
  valor_adicional: string | null
  valor_disminuir: string | null
  valor_a_pagar: string | null
  valor_anticipo: string | null
  reten_fuente: string | null
  reten_ica: string | null
  saldo_pagar: string | null
}

// Convierte 'DD/MM/YYYY' (formato del portal) a ISO 'YYYY-MM-DD'. Devuelve null si no
// tiene esa forma exacta — no inventa ni corrige fechas raras (ej. la de aceptación de
// prueba que a veces trae el portal). Se ignora cualquier hora pegada al final.
export function fechaPortalToISO(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Convierte '4,715,000' → 4715000. null si no hay dígitos.
export function valorPortalToNumber(raw: string | null): number | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

export function parseManifiestoTexto(texto: string): ManifiestoTexto {
  const low = texto.toLowerCase()
  // 1) localizar cada ancla secuencialmente (indexOf hacia adelante desde el cursor)
  const pos: number[] = []
  let cursor = 0
  for (const [label] of ANCLAS) {
    const i = low.indexOf(label.toLowerCase(), cursor)
    pos.push(i)
    cursor = i >= 0 ? i + label.length : cursor
  }
  // 2) valor = texto entre el fin de un ancla y el inicio del siguiente ancla localizado
  const out: Record<string, string> = {}
  for (let k = 0; k < ANCLAS.length; k++) {
    const [label, key] = ANCLAS[k]
    if (!key || pos[k] < 0) continue
    const start = pos[k] + label.length
    let end = texto.length
    for (let n = k + 1; n < ANCLAS.length; n++) {
      if (pos[n] >= 0) { end = pos[n]; break }
    }
    out[key] = texto.slice(start, end).trim()
  }
  // separar cédula/NIT del nombre del conductor ("1020485007 DANIEL CANO GARCIA")
  const cm = (out.conductor ?? '').match(/^(\d{6,12})\s+(.+)$/)
  // placa: extraer solo el patrón de placa del valor capturado (self-delimita)
  const placaMatch = (out.placa ?? '').match(/[A-Z]{2,4}\d{3,4}/i)
  // producto: solo la primera línea tras "Producto:" (corta antes de "Cantidad:"/CARGUE…)
  const productoLinea = (out.producto ?? '').split('\n')[0].trim()
  return {
    placa: placaMatch ? placaMatch[0].toUpperCase() : null,
    producto: productoLinea || null,
    origen: out.origen ?? null,
    destino: out.destino ?? null,
    empresa: out.empresa ?? null,
    conductor_doc: cm ? cm[1] : null,
    conductor_nombre: cm ? cm[2].trim() : (out.conductor ?? null),
    radicado: out.radicado ?? null,
    manifiesto: out.manifiesto ?? null,
    fecha_viaje: out.fecha_viaje ?? null,
    valor_viaje: out.valor_viaje ?? null,
    fecha_aceptacion: out.fecha_aceptacion ?? null,
    cumplido: out.cumplido ?? null,
    fecha_cumplido: out.fecha_cumplido ?? null,
    valor_adicional: out.valor_adicional ?? null,
    valor_disminuir: out.valor_disminuir ?? null,
    valor_a_pagar: out.valor_a_pagar ?? null,
    valor_anticipo: out.valor_anticipo ?? null,
    reten_fuente: out.reten_fuente ?? null,
    reten_ica: out.reten_ica ?? null,
    saldo_pagar: out.saldo_pagar ?? null,
  }
}

// Bloque de texto legible con los campos que NO tienen columna en trips, para guardar en
// notes. Las RETENCIONES van primero y marcadas — bajo régimen SIMPLE ISADAN no debería
// ser sujeto de retención en la fuente ni de ICA (salvo pagos laborales); si un cliente
// las está aplicando, esto es evidencia visible del posible cobro indebido a auditar.
export function construirNotasExtra(m: ManifiestoTexto): string {
  const lineas: string[] = []
  const ret: string[] = []
  if (m.reten_fuente && valorPortalToNumber(m.reten_fuente)) ret.push(`Retención en la Fuente: ${m.reten_fuente}`)
  if (m.reten_ica && valorPortalToNumber(m.reten_ica)) ret.push(`Retención de ICA: ${m.reten_ica}`)
  if (ret.length) {
    lineas.push('⚠ RETENCIONES APLICADAS POR EL CLIENTE (revisar bajo régimen SIMPLE):')
    lineas.push(...ret.map(r => `  ${r}`))
  }
  const otros: [string, string | null][] = [
    ['Valor Adicional Tiempos Logísticos', m.valor_adicional],
    ['Valor a Disminuir Tiempos Logísticos', m.valor_disminuir],
    ['Valor a Pagar', m.valor_a_pagar],
    ['Saldo a Pagar', m.saldo_pagar],
    ['Cumplido', m.cumplido],
    ['Fecha aceptación', m.fecha_aceptacion],
  ]
  const otrosPresentes = otros.filter(([, v]) => v)
  if (otrosPresentes.length) {
    lineas.push('Datos del manifiesto (portal):')
    lineas.push(...otrosPresentes.map(([k, v]) => `  ${k}: ${v}`))
  }
  return lineas.join('\n')
}
