/**
 * Sesión firmada — HMAC-SHA256 sobre Web Crypto API.
 *
 * Se usa Web Crypto (globalThis.crypto.subtle) y no el módulo 'crypto' de Node,
 * para que el MISMO módulo funcione tanto en las Server Actions (Node runtime)
 * como en el middleware (Edge Runtime, donde 'crypto' de Node no existe).
 *
 * Token: base64url(payload) + "." + base64url(HMAC-SHA256(base64url(payload)))
 * payload = JSON { exp: <timestamp unix en segundos> }
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── base64url sin Buffer (Buffer no existe en Edge) ──────────────────────────
function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const strToB64url = (s: string) => bytesToB64url(encoder.encode(s))
const b64urlToStr = (s: string) => decoder.decode(b64urlToBytes(s))

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Firma una sesión que expira dentro de `ttlSeconds`. Devuelve el token para la cookie. */
export async function signSession(secret: string, ttlSeconds: number): Promise<string> {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  const payloadB64 = strToB64url(payload)
  const key = await hmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)))
  return `${payloadB64}.${bytesToB64url(sig)}`
}

/** Verifica firma + expiración. Devuelve false ante cualquier manipulación o token vencido. */
export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sigB64] = parts
  try {
    const key = await hmacKey(secret)
    // crypto.subtle.verify hace la comparación de la firma en tiempo constante.
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sigB64), encoder.encode(payloadB64))
    if (!ok) return false
    const data = JSON.parse(b64urlToStr(payloadB64))
    if (typeof data?.exp !== 'number') return false
    return Math.floor(Date.now() / 1000) < data.exp
  } catch {
    return false
  }
}

/**
 * Comparación en tiempo constante de dos strings (para el PIN).
 * Se comparan los digest SHA-256 de ambos → longitud fija, sin fuga de longitud
 * ni cortocircuito por carácter. Nunca usar === para el PIN.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}
