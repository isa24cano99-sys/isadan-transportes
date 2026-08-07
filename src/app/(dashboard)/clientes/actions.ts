'use server'

// SOLO LECTURA. La gestión de clientes se hace ahora desde /terceros. Estas actions se
// conservan (por si algo las referencia) pero devuelven un early-return: escribían directo
// a la tabla legacy `clients` SIN pasar por terceros — puerta trasera que dejaba huérfanos
// sin tercero_id e invisibles para viajes/bancos/contabilidad. Ver investigación de puerta
// trasera. No se borran; se neutralizan.

const DESHABILITADO = 'Deshabilitado — la gestión de clientes ahora se hace desde /terceros'

export async function crearClienteAction(_formData: FormData) {
  return { ok: false as const, error: DESHABILITADO }
}

export async function sincronizarDataicoAction() {
  return { ok: false as const, error: DESHABILITADO }
}

export async function eliminarClienteAction(_id: string, _force = false): Promise<
  | { ok: true }
  | { ok: false; tripCount: number }
  | { ok: false; error: string }
> {
  return { ok: false, error: DESHABILITADO }
}

export async function actualizarClienteAction(_formData: FormData) {
  return { ok: false as const, error: DESHABILITADO }
}
