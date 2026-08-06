'use client'

import { useMemo, useState } from 'react'
import { formatCOP } from '@/lib/utils'

export type FilaExogena = {
  concepto: string
  cuenta: string
  cuentaNombre: string
  comprobante: string
  fecha: string
  periodo: string
  terceroNit: string | null
  terceroDv: number | null
  tipoDocumento: string | null
  terceroNombre: string
  direccion: string | null
  depto: string | null
  municipio: string | null
  completo: boolean
  debito: number
  credito: number
}

const CONCEPTO_LABEL: Record<string, string> = {
  '1001': '1001 · Pagos',
  '2276': '2276 · Rentas de trabajo',
}

// Descarga un CSV (separador ; para Excel en es-CO, donde la coma es decimal).
function descargarCSV(nombre: string, filas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = filas.map(f => f.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExogenaConsultaClient({ filas, periodos }: { filas: FilaExogena[]; periodos: string[] }) {
  const [concepto, setConcepto] = useState<string>('todos')
  const [periodo, setPeriodo] = useState<string>(periodos[0] ?? 'todos')
  const [vista, setVista] = useState<'detalle' | 'resumen'>('resumen')

  const visibles = useMemo(
    () => filas.filter(f =>
      (concepto === 'todos' || f.concepto === concepto) &&
      (periodo === 'todos' || f.periodo === periodo)),
    [filas, concepto, periodo],
  )

  // Resumen: agrupa por (concepto, tercero) — lo que mapea directo al reporte exógena.
  const resumen = useMemo(() => {
    const m = new Map<string, FilaExogena & { debito: number; credito: number }>()
    for (const f of visibles) {
      const k = `${f.concepto}|${f.terceroNit}`
      const a = m.get(k)
      if (a) { a.debito += f.debito; a.credito += f.credito }
      else m.set(k, { ...f })
    }
    return [...m.values()].sort((x, y) =>
      x.concepto.localeCompare(y.concepto) || (y.debito - y.credito) - (x.debito - x.credito))
  }, [visibles])

  const totD = visibles.reduce((s, f) => s + f.debito, 0)
  const totC = visibles.reduce((s, f) => s + f.credito, 0)

  const incompletos = useMemo(() => {
    const m = new Map<string, string>()
    // Consumidor Final (cuantías menores) es correcto sin dirección — no se marca como faltante.
    for (const f of visibles) {
      if (!f.completo && f.terceroNit !== '222222222222' && f.terceroNit)
        m.set(f.terceroNit, f.terceroNombre)
    }
    return [...m.entries()]
  }, [visibles])

  const exportar = () => {
    const suf = `${concepto}_${periodo}`.replace(/\s/g, '')
    if (vista === 'resumen') {
      const head = ['Concepto', 'Tipo doc', 'NIT', 'DV', 'Nombre', 'Direccion', 'Depto', 'Municipio', 'Debito', 'Credito']
      const body = resumen.map(r => [r.concepto, r.tipoDocumento, r.terceroNit, r.terceroDv, r.terceroNombre, r.direccion, r.depto, r.municipio, r.debito, r.credito])
      descargarCSV(`exogena_resumen_${suf}.csv`, [head, ...body])
    } else {
      const head = ['Concepto', 'Cuenta', 'Cuenta nombre', 'Comprobante', 'Fecha', 'Tipo doc', 'NIT', 'DV', 'Nombre', 'Direccion', 'Depto', 'Municipio', 'Debito', 'Credito']
      const body = visibles.map(f => [f.concepto, f.cuenta, f.cuentaNombre, f.comprobante, f.fecha?.slice(0, 10), f.tipoDocumento, f.terceroNit, f.terceroDv, f.terceroNombre, f.direccion, f.depto, f.municipio, f.debito, f.credito])
      descargarCSV(`exogena_detalle_${suf}.csv`, [head, ...body])
    }
  }

  const chip = (activo: boolean) =>
    `text-xs font-medium px-3 py-1 rounded-full border transition-colors ${activo
      ? 'bg-blue-600 text-white border-blue-600'
      : 'text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'}`

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-[#94A3B8] mr-1">Concepto</span>
          <button className={chip(concepto === 'todos')} onClick={() => setConcepto('todos')}>Todos</button>
          <button className={chip(concepto === '1001')} onClick={() => setConcepto('1001')}>1001 · Pagos</button>
          <button className={chip(concepto === '2276')} onClick={() => setConcepto('2276')}>2276 · Rentas trabajo</button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-[#94A3B8] mr-1">Periodo</span>
          <button className={chip(periodo === 'todos')} onClick={() => setPeriodo('todos')}>Todos</button>
          {periodos.map(p => (
            <button key={p} className={chip(periodo === p)} onClick={() => setPeriodo(p)}>{p}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button className={chip(vista === 'resumen')} onClick={() => setVista('resumen')}>Resumen por tercero</button>
          <button className={chip(vista === 'detalle')} onClick={() => setVista('detalle')}>Detalle</button>
        </div>
        <button onClick={exportar}
          className="text-xs font-medium bg-[#0F172A] hover:bg-[#1E293B] text-white px-3 py-1.5 rounded-lg">
          Exportar CSV
        </button>
      </div>

      {/* Aviso de terceros incompletos */}
      {incompletos.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ {incompletos.length} tercero{incompletos.length > 1 ? 's' : ''} sin dirección/municipio completos —
          el contador debe completarlos antes de reportar: {incompletos.map(([nit, nom]) => `${nom} (${nit})`).join(', ')}.
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-6">
          No hay movimientos con concepto exógena para el filtro seleccionado.
        </p>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#94A3B8] text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-3 py-2">Concepto</th>
                  {vista === 'detalle' && <>
                    <th className="text-left font-medium px-3 py-2">Cuenta</th>
                    <th className="text-left font-medium px-3 py-2">Comprob.</th>
                    <th className="text-left font-medium px-3 py-2">Fecha</th>
                  </>}
                  <th className="text-left font-medium px-3 py-2">Doc</th>
                  <th className="text-left font-medium px-3 py-2">NIT</th>
                  <th className="text-left font-medium px-3 py-2">DV</th>
                  <th className="text-left font-medium px-3 py-2">Tercero</th>
                  <th className="text-left font-medium px-3 py-2">Dirección</th>
                  <th className="text-left font-medium px-3 py-2">Dpto</th>
                  <th className="text-left font-medium px-3 py-2">Mun</th>
                  <th className="text-right font-medium px-3 py-2">Débito</th>
                  <th className="text-right font-medium px-3 py-2">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {(vista === 'resumen' ? resumen : visibles).map((f, i) => {
                  const inc = !f.completo && f.terceroNit !== '222222222222'
                  return (
                    <tr key={i} className={`border-b border-[#F1F5F9] last:border-0 ${inc ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-3 py-2 text-[#64748B]">{f.concepto}</td>
                      {vista === 'detalle' && <>
                        <td className="px-3 py-2 tabular-nums text-[#64748B]" title={f.cuentaNombre}>{f.cuenta}</td>
                        <td className="px-3 py-2 text-[#64748B]">{f.comprobante}</td>
                        <td className="px-3 py-2 tabular-nums text-[#64748B]">{f.fecha?.slice(0, 10)}</td>
                      </>}
                      <td className="px-3 py-2 text-[#64748B]">{f.tipoDocumento ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-[#0F172A]">{f.terceroNit ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-[#64748B]">{f.terceroDv ?? ''}</td>
                      <td className="px-3 py-2 text-[#0F172A]">
                        {f.terceroNombre}
                        {inc && <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">incompleto</span>}
                      </td>
                      <td className="px-3 py-2 text-[#64748B] max-w-48 truncate" title={f.direccion ?? ''}>{f.direccion ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-[#64748B]">{f.depto ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-[#64748B]">{f.municipio ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.debito ? formatCOP(f.debito) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.credito ? formatCOP(f.credito) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E2E8F0] font-medium text-[#0F172A]">
                  <td className="px-3 py-2" colSpan={vista === 'detalle' ? 10 : 7}>
                    {vista === 'resumen' ? `${resumen.length} terceros` : `${visibles.length} líneas`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCOP(totD)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCOP(totC)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
