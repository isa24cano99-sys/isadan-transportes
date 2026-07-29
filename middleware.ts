import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/login')) {
    return NextResponse.next()
  }

  // Se VERIFICA la firma HMAC de la cookie (no basta con que exista): una cookie
  // fabricada a mano o con la firma/exp manipulada no pasa. Web Crypto → Edge OK.
  const token = request.cookies.get('tc_session')?.value
  const secret = process.env.SESSION_SECRET
  const valid = secret ? await verifySession(token, secret) : false

  if (!valid) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
