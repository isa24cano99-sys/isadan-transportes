'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { sincronizarCuotasAction } from '../actions'

export function SyncButton({ loanId }: { loanId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setMsg(null)
    const result = await sincronizarCuotasAction(loanId)
    if (result.ok) {
      const count = result.synced ?? 0
      setMsg({
        text: count > 0 ? `${count} cuota${count !== 1 ? 's' : ''} sincronizada${count !== 1 ? 's' : ''}` : 'Todo al día',
        ok: true,
      })
      router.refresh()
    } else {
      setMsg({ text: result.error ?? 'Error al sincronizar', ok: false })
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-xs font-medium ${msg.ok ? 'text-green-700' : 'text-red-500'}`}>
          {msg.text}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0] px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Sincronizando...' : 'Sincronizar cuotas'}
      </button>
    </div>
  )
}
