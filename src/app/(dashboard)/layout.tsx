import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

function isValidToken(token: string | undefined): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    return Date.now() < payload.exp
  } catch {
    return false
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('tc_session')?.value

  if (!isValidToken(token)) {
    redirect('/login')
  }

  return (
    <AppShell>
      {children}
    </AppShell>
  )
}