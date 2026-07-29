'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signSession, constantTimeEqual } from '@/lib/session'

const PIN_COOKIE = 'tc_session'
const SESSION_SECONDS = 12 * 60 * 60

// El PIN se recibe dentro de un FormData (no como argumento posicional) para que
// no aparezca en texto plano en los logs de Server Actions de Next en desarrollo.
export async function loginAction(formData: FormData): Promise<{ ok: boolean }> {
  const pin = String(formData.get('pin') ?? '')

  const correctPin = process.env.APP_PIN
  if (!correctPin) {
    console.error('[login] APP_PIN no está definido — se rechaza el login')
    return { ok: false }
  }
  // PIN mínimo 6 caracteres: evita reconfigurar un PIN débil por accidente.
  if (correctPin.length < 6) {
    console.error(`[login] APP_PIN es demasiado corto (${correctPin.length} caracteres); el mínimo es 6. Se rechaza el login.`)
    return { ok: false }
  }
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    console.error('[login] SESSION_SECRET no está definido — se rechaza el login')
    return { ok: false }
  }

  if (!(await constantTimeEqual(pin, correctPin))) return { ok: false }

  const token = await signSession(secret, SESSION_SECONDS)

  const cookieStore = await cookies()
  cookieStore.set(PIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_SECONDS,
    path: '/',
  })

  return { ok: true }
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(PIN_COOKIE)
  redirect('/login')
}
