import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { verifySession } from '@/lib/session'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Misma validación de sesión que el middleware (única fuente de verdad):
  // verifica la firma HMAC del token, no solo que la cookie exista.
  const cookieStore = await cookies()
  const token = cookieStore.get('tc_session')?.value
  const secret = process.env.SESSION_SECRET

  if (!secret || !(await verifySession(token, secret))) {
    redirect('/login')
  }

  return (
    <AppShell>
      {children}
    </AppShell>
  )
}
