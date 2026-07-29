import LoginForm from './LoginForm'

// Se evalúa en cada request (no en build): APP_PIN es una env var de runtime y
// puede no existir al momento del build en Vercel.
export const dynamic = 'force-dynamic'

// Server component: lee la LONGITUD del PIN configurado (nunca el valor) y la
// pasa al formulario para renderizar tantas casillas como dígitos tenga el PIN.
export default function LoginPage() {
  const pinLength = (process.env.APP_PIN ?? '').length

  // El PIN debe tener mínimo 6 dígitos. Si está mal configurado, no se muestra
  // el formulario (y loginAction también lo rechaza en el servidor).
  if (pinLength < 6) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 sm:p-10 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-lg font-semibold text-[#0F172A] mb-2">Acceso mal configurado</h1>
          <p className="text-sm text-[#64748B]">
            El PIN de acceso debe tener al menos 6 dígitos. Revisa la variable{' '}
            <code className="font-mono text-[#0F172A]">APP_PIN</code> del entorno.
          </p>
        </div>
      </div>
    )
  }

  return <LoginForm pinLength={pinLength} />
}
