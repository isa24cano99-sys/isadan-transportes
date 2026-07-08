'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { fetchComprobanteAction } from './export-comprobante'

export function ExportComprobanteButton({
  legId,
  compact = false,
}: {
  legId: string
  compact?: boolean
}) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await fetchComprobanteAction(legId)
      if (!res.ok || !res.data) {
        alert(res.error ?? 'Error al generar comprobante')
        return
      }

      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()

      const headers = [
        'Fecha', 'Tipo comprobante', 'Descripción', 'Cuenta',
        'Nombre cuenta', 'Tercero', 'Débito', 'Crédito',
      ]
      const dataRows = res.data.rows.map(r => [
        r.fecha, r.tipoComprobante, r.descripcion, r.cuenta,
        r.nombreCuenta, r.tercero, r.debito, r.credito,
      ])

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 12 },
        { wch: 30 }, { wch: 35 }, { wch: 15 }, { wch: 15 },
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Comprobante')
      XLSX.writeFile(wb, `comprobante_${res.data.tripNumber}_${res.data.fecha}.xlsx`)
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleExport}
        disabled={loading}
        title="Exportar comprobante Dataico"
        className="p-1 text-[#64748B] hover:text-emerald-600 transition-colors disabled:opacity-40"
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" />
          : <Download size={13} />}
      </button>
    )
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[44px]"
    >
      {loading
        ? <Loader2 size={14} className="animate-spin" />
        : <Download size={14} />}
      {loading ? 'Generando…' : 'Exportar comprobante Dataico'}
    </button>
  )
}
