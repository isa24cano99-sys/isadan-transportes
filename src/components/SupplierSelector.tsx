'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Building2, X, Plus } from 'lucide-react'
import {
  buscarProveedoresAction,
  crearProveedorAction,
  type SupplierResult,
} from '@/app/(dashboard)/bancos/category-actions'

export default function SupplierSelector({
  nit,
  name,
  onChange,
}: {
  nit: string
  name: string
  onChange: (nit: string, name: string) => void
}) {
  const [search,    setSearch]    = useState(name)
  const [results,   setResults]   = useState<SupplierResult[]>([])
  const [open,      setOpen]      = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [newNit,    setNewNit]    = useState('')
  const [newNombre, setNewNombre] = useState('')
  const [newTipo,   setNewTipo]   = useState<'CLIENTE' | 'PROVEEDOR'>('PROVEEDOR')
  const [saving,    setSaving]    = useState(false)
  const [createWarning, setCreateWarning] = useState<string | null>(null)
  const debRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (name !== search) setSearch(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const handleSearch = useCallback((val: string) => {
    setSearch(val)
    setCreateWarning(null)
    if (!val.trim()) { onChange('', ''); setResults([]); setOpen(false); return }
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      const res = await buscarProveedoresAction(val)
      setResults(res)
      setOpen(true)
    }, 300)
  }, [onChange])

  const select = (s: SupplierResult) => {
    onChange(s.nit ?? '', s.nombre)
    setSearch(s.nombre)
    setResults([])
    setOpen(false)
    setCreating(false)
  }

  const clearSelection = () => {
    onChange('', '')
    setSearch('')
    setResults([])
    setOpen(false)
    setCreateWarning(null)
  }

  const handleCreate = async () => {
    if (!newNombre.trim()) return
    setSaving(true)
    const fd = new FormData()
    fd.set('nombre', newNombre.trim())
    fd.set('tipo', newTipo)
    if (newNit.trim()) fd.set('nit', newNit.trim())
    const res = await crearProveedorAction(fd)
    if (res.ok && res.supplier) {
      setCreateWarning(res.warning ?? null)
      select(res.supplier)
      setNewNit(''); setNewNombre('')
    }
    setSaving(false)
  }

  const miniInputCls = 'w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 border border-[#E2E8F0] rounded-lg px-3 py-2.5 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
        <Building2 size={13} className="text-[#94A3B8] shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Buscar por nombre o NIT..."
          className="flex-1 text-sm text-[#0F172A] outline-none bg-transparent placeholder:text-[#94A3B8] min-w-0"
        />
        {(search || nit) && (
          <button type="button" onClick={clearSelection}>
            <X size={12} className="text-[#94A3B8] hover:text-[#64748B]" />
          </button>
        )}
      </div>
      {nit && <p className="mt-1 text-[10px] text-[#94A3B8]">NIT: {nit}</p>}
      {createWarning && (
        <p className="mt-1 text-[10px] text-amber-600 flex items-start gap-1">
          <span className="shrink-0">⚠</span><span>{createWarning}</span>
        </p>
      )}

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {results.length > 0 ? results.map(s => (
              <button key={s.id} type="button" onClick={() => select(s)}
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm hover:bg-[#F1F5F9] transition-colors border-b border-[#E2E8F0] last:border-0">
                <span className="flex gap-1 shrink-0">
                  {s.es_cliente && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Cliente</span>
                  )}
                  {s.es_proveedor && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Proveedor</span>
                  )}
                  {!s.es_cliente && !s.es_proveedor && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Tercero</span>
                  )}
                </span>
                <span className="text-[#0F172A] font-medium flex-1 min-w-0 truncate">{s.nombre}</span>
                {s.nit && <span className="text-[10px] text-[#94A3B8] shrink-0">NIT {s.nit}</span>}
              </button>
            )) : (
              <p className="text-xs text-[#94A3B8] text-center py-4">Sin resultados para &ldquo;{search}&rdquo;</p>
            )}
          </div>
          <div className="border-t border-[#E2E8F0]">
            {!creating ? (
              <button type="button" onClick={() => { setCreating(true); setNewNombre(search) }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#2563EB] hover:bg-blue-50 font-medium transition-colors">
                <Plus size={13} /> Nuevo tercero
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-[#F8FAFC]">
                <p className="text-xs font-semibold text-[#64748B]">Nuevo tercero</p>
                {/* Categorizar: cliente o proveedor */}
                <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden">
                  {(['CLIENTE', 'PROVEEDOR'] as const).map((tp, i) => (
                    <button key={tp} type="button" onClick={() => setNewTipo(tp)}
                      className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-[#E2E8F0]' : ''} ${
                        newTipo === tp
                          ? tp === 'CLIENTE' ? 'bg-emerald-600 text-white' : 'bg-[#2563EB] text-white'
                          : 'bg-white text-[#64748B] hover:bg-[#F1F5F9]'
                      }`}>
                      {tp === 'CLIENTE' ? 'Cliente' : 'Proveedor'}
                    </button>
                  ))}
                </div>
                <input autoFocus type="text" value={newNombre} onChange={e => setNewNombre(e.target.value)}
                  placeholder="Nombre *" className={miniInputCls} />
                <input type="text" value={newNit} onChange={e => setNewNit(e.target.value)}
                  placeholder="NIT (opcional)" className={miniInputCls} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setCreating(false); setNewNombre('') }}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] text-xs font-medium py-1.5 rounded-lg hover:bg-white transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleCreate} disabled={!newNombre.trim() || saving}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg transition-colors">
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
