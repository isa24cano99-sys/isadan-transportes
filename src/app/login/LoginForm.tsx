'use client'

import { useState, useRef, useEffect } from 'react'
import { loginAction } from './actions'

// Recibe SOLO la longitud del PIN (nunca el valor) desde el server component.
export default function LoginForm({ pinLength }: { pinLength: number }) {
  const [pin, setPin] = useState<string[]>(() => Array(pinLength).fill(''))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const formRef = useRef<HTMLFormElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const complete = pin.length === pinLength && pin.every(d => d !== '')

  // Auto-submit cuando el PIN está completo. Va en useEffect (no en el onChange)
  // para que dispare DESPUÉS de que React actualizó el estado y, con él, el valor
  // del input hidden name="pin". Si se disparara dentro del onChange, el hidden
  // aún tendría el valor anterior (le faltaría el último dígito).
  useEffect(() => {
    if (complete && !submittingRef.current) {
      formRef.current?.requestSubmit()
    }
  }, [complete])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value.slice(-1)
    setPin(newPin)
    setError('')
    if (value && index < pinLength - 1) inputs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submittingRef.current) return
    // El FormData se arma DESDE el form real → incluye el input hidden name="pin".
    const fd = new FormData(e.currentTarget)
    const finalPin = String(fd.get('pin') ?? '')
    if (finalPin.length < pinLength) return

    submittingRef.current = true
    setLoading(true)
    const result = await loginAction(fd)
    if (result.ok) {
      window.location.href = '/'
    } else {
      setError('PIN incorrecto')
      setPin(Array(pinLength).fill(''))
      submittingRef.current = false
      setLoading(false)
      setTimeout(() => inputs.current[0]?.focus(), 50)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="bg-white border border-[#E2E8F0] rounded-2xl p-8 sm:p-10 w-full max-w-sm shadow-sm text-center"
      >
        {/* Un único campo con name="pin": la fuente del FormData que llega al servidor */}
        <input type="hidden" name="pin" value={pin.join('')} readOnly />

        <div className="w-14 h-14 bg-[#2563EB] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="5.5" cy="18.5" r="2.5" stroke="white" strokeWidth="2"/>
            <circle cx="18.5" cy="18.5" r="2.5" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#0F172A] mb-1">ISADAN Transportes</h1>
        <p className="text-sm text-[#64748B] mb-8">Ingresa el PIN de acceso</p>
        <div className="flex gap-2 justify-center mb-6">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all
                ${error ? 'border-red-400 bg-red-50' : digit ? 'border-blue-500 bg-blue-50' : 'border-[#E2E8F0] bg-white'}
                focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`}
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-500 mb-4 font-medium">{error}</p>}
        <button
          type="submit"
          disabled={!complete || loading}
          className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
        <p className="text-xs text-[#94A3B8] mt-6">Transportes La Montaña SAS</p>
      </form>
    </div>
  )
}
