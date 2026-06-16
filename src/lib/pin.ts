const PIN_COOKIE = 'tc_session'
const SESSION_HOURS = 12

export function validatePin(input: string): boolean {
  const correctPin = process.env.APP_PIN
  if (!correctPin) throw new Error('APP_PIN no definido en .env')
  return input === correctPin
}

export function createSessionToken(): string {
  const payload = {
    ts: Date.now(),
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function isSessionValid(token: string | undefined): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    return Date.now() < payload.exp
  } catch {
    return false
  }
}

export { PIN_COOKIE, SESSION_HOURS }
