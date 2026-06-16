'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loginAction } from './actions'

export default function LoginPage() {
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value.slice(-1)
    setPin(newPin)
    setError('')
    if (value && index < 3) inputs.current[index + 1]?.focus()
    if (newPin.every(d => d !== '')) handleSubmit(newPin.join(''))
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const handleSubmit = async (pinStr?: string) => {
    const finalPin = pinStr ?? pin.join('')
    if (finalPin.length < 4) return
    setLoading(true)
    const result = await loginAction(finalPin)
if (result.ok) {
  window.location.href = '/'
} else {
      setError('PIN incorrecto')
      setPin(['', '', '', ''])
      setTimeout(() => inputs.current[0]?.focus(), 50)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 w-full max-w-sm shadow-sm text-center">
        <div className="w-14 h-14 bg-[#2563EB] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="5.5" cy="18.5" r="2.5" stroke="white" strokeWidth="2"/>
            <circle cx="18.5" cy="18.5" r="2.5" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#0F172A] mb-1">ISADAN Transportes</h1>
        <p className="text-sm text-[#64748B] mb-8">Ingresa el PIN de acceso</p>
        <div className="flex gap-3 justify-center mb-6">
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
              className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all
                ${error ? 'border-red-400 bg-red-50' : digit ? 'border-blue-500 bg-blue-50' : 'border-[#E2E8F0] bg-white'}
                focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`}
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-500 mb-4 font-medium">{error}</p>}
        <button
          onClick={() => handleSubmit()}
          disabled={pin.some(d => !d) || loading}
          className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
        <p className="text-xs text-[#94A3B8] mt-6">Transportes La Montaña SAS</p>
      </div>
    </div>
  )
}
