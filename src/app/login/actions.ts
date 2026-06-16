'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const PIN_COOKIE = 'tc_session'
const SESSION_HOURS = 12

export async function loginAction(pin: string): Promise<{ ok: boolean }> {
  const correctPin = '1234'
if (pin !== correctPin) return { ok: false }

  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  })).toString('base64')

  const cookieStore = await cookies()
  cookieStore.set(PIN_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 60 * 60,
    path: '/',
  })

  return { ok: true }
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(PIN_COOKIE)
  redirect('/login')
}
