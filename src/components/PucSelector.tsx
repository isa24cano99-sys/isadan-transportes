'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, X, ChevronDown } from 'lucide-react'
import { crearPucCuentaAction } from '@/app/(dashboard)/bancos/puc-actions'

export type PucAccount = {
  id: string
  codigo: string
  nombre: string
  tipo: string
  active: boolean
}

export const PUC_TIPO_LABELS: Record<string, string> = {
  INGRESO:                    'Ingresos',
  INGRESO_FINANCIERO:         'Ingresos financieros',
  INGRESO_NO_FACTURADO:       'Ingresos no facturados',
  COSTO_OPERACIONAL:          'Costos operacionales',
  GASTO_PERSONAL:             'Gastos de personal',
  GASTO_ADMIN:                'Gastos generales y administrativos',
  GASTO_FINANCIERO:           'Gastos financieros',
  GASTO_PERSONAL_PROPIETARIO: 'Gastos personales propietario',
  IMPUESTO:                   'Impuestos',
  ACTIVO_ANTICIPO:            'Activos y anticipos',
}

const TIPO_ORDER = [
  'INGRESO', 'INGRESO_FINANCIERO', 'INGRESO_NO_FACTURADO',
  'COSTO_OPERACIONAL', 'GASTO_PERSONAL', 'GASTO_ADMIN',
  'GASTO_FINANCIERO', 'GASTO_PERSONAL_PROPIETARIO',
  'IMPUESTO', 'ACTIVO_ANTICIPO',
]

export default function PucSelector({
  value,
  onChange,
  pucAccounts: initial,
  className = '',
}: {
  value: string
  onChange: (codigo: string) => void
  pucAccounts: PucAccount[]
  className?: string
}) {
  const [accounts, setAccounts] = useState(initial)
  const [open,      setOpen]    = useState(false)
  const [search,    setSearch]  = useState('')
  const [creating,  setCreating] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newTipo,   setNewTipo]   = useState('GASTO_ADMIN')
  const [saving,    setSaving]    = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const selected = accounts.find(a => a.codigo === value) ?? null

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? accounts.filter(a => a.active && (a.nombre.toLowerCase().includes(q) || a.codigo.includes(q)))
    : accounts.filter(a => a.active)

  const groups = TIPO_ORDER
    .map(tipo => ({
      tipo,
      label: PUC_TIPO_LABELS[tipo] ?? tipo,
      items: filtered.filter(a => a.tipo === tipo),
    }))
    .filter(g => g.items.length > 0)

  const handleSelect = (codigo: string) => {
    onChange(codigo)
    setOpen(false)
    setSearch('')
    setCreating(false)
  }

  const handleCreate = async () => {
    if (!newNombre.trim()) return
    setSaving(true)
    const res = await crearPucCuentaAction({ nombre: newNombre.trim(), tipo: newTipo })
    if (res.ok && res.account) {
      const acc = res.account as PucAccount
      setAccounts(prev => [...prev, acc])
      handleSelect(acc.codigo)
      setNewNombre('')
      setCreating(false)
    }
    setSaving(false)
  }

  const displayValue = open ? search : (selected ? `${selected.codigo} · ${selected.nombre}` : '')

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Visible combobox trigger */}
      <div
        className="flex items-center gap-2 border border-[#E2E8F0] rounded-lg px-3 py-2.5 bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <Search size={13} className="text-[#94A3B8] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 text-sm text-[#0F172A] outline-none bg-transparent placeholder:text-[#94A3B8] min-w-0"
          placeholder={selected ? '' : 'Buscar cuenta PUC...'}
          value={displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => { setOpen(true); setSearch('') }}
        />
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(''); setSearch('') }}
          >
            <X size={12} className="text-[#94A3B8] hover:text-[#64748B]" />
          </button>
        )}
        <ChevronDown
          size={13}
          className={`text-[#94A3B8] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {groups.length === 0 && (
              <p className="text-xs text-[#94A3B8] text-center py-5">Sin resultados</p>
            )}
            {groups.map(g => (
              <div key={g.tipo}>
                <div className="px-3 py-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  {g.label}
                </div>
                {g.items.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelect(a.codigo)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#F1F5F9] transition-colors flex items-center gap-3 ${
                      a.codigo === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-[#0F172A]'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-[#94A3B8] shrink-0 w-20">{a.codigo}</span>
                    <span className="truncate">{a.nombre}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="border-t border-[#E2E8F0]">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#2563EB] hover:bg-blue-50 transition-colors font-medium"
              >
                <Plus size={13} /> Nueva cuenta PUC
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-[#F8FAFC]">
                <p className="text-xs font-semibold text-[#64748B]">Nueva cuenta</p>
                <input
                  autoFocus
                  type="text"
                  value={newNombre}
                  onChange={e => setNewNombre(e.target.value)}
                  placeholder="Nombre de la cuenta"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <select
                  value={newTipo}
                  onChange={e => setNewTipo(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {TIPO_ORDER.map(t => (
                    <option key={t} value={t}>{PUC_TIPO_LABELS[t] ?? t}</option>
                  ))}
                </select>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setNewNombre('') }}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] text-xs font-medium py-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newNombre.trim() || saving}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
                  >
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
