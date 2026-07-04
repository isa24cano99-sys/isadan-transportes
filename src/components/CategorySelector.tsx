'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, X, ChevronDown } from 'lucide-react'
import { crearCategoriaAction, type TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'
import type { PucAccount } from './PucSelector'

const PUC_TIPO_LABEL: Record<string, string> = {
  INGRESO:                    'Ingresos',
  INGRESO_FINANCIERO:         'Ingresos financieros',
  INGRESO_NO_FACTURADO:       'Ingresos no facturados',
  COSTO_OPERACIONAL:          'Costos operacionales',
  GASTO_PERSONAL:             'Personal',
  GASTO_ADMIN:                'Administrativo',
  GASTO_FINANCIERO:           'Financiero',
  IMPUESTO:                   'Impuestos',
  ACTIVO_ANTICIPO:            'Anticipos',
  GASTO_PERSONAL_PROPIETARIO: 'Gastos personales propietario',
}

const NEGOCIO_TIPO_ORDER = [
  'INGRESO', 'INGRESO_FINANCIERO', 'INGRESO_NO_FACTURADO',
  'COSTO_OPERACIONAL', 'GASTO_PERSONAL', 'GASTO_ADMIN',
  'GASTO_FINANCIERO', 'IMPUESTO', 'ACTIVO_ANTICIPO',
]

export default function CategorySelector({
  value,
  onChange,
  categories: initial,
  pucAccounts,
  typeFilter: typeFilterProp,
}: {
  value: string
  onChange: (id: string) => void
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  typeFilter?: 'NEGOCIO' | 'CASA'
}) {
  const [categories, setCategories] = useState(initial)
  const [open,       setOpen]    = useState(false)
  const [search,     setSearch]  = useState('')
  const [typeFilter, setTypeFilter] = useState<'NEGOCIO' | 'CASA' | undefined>(typeFilterProp)
  const [creating,   setCreating] = useState(false)
  const [newName,    setNewName]  = useState('')
  const [newType,    setNewType]  = useState<'NEGOCIO' | 'CASA'>('NEGOCIO')
  const [newPuc,     setNewPuc]   = useState('')
  const [saving,     setSaving]   = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const selected = categories.find(c => c.id === value) ?? null

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch(''); setCreating(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = search.trim().toLowerCase()
  const active = categories.filter(c => c.active)
  const byText = q ? active.filter(c => c.name.toLowerCase().includes(q)) : active
  const filtered = typeFilter ? byText.filter(c => c.type === typeFilter) : byText

  const negocioItems = filtered.filter(c => c.type === 'NEGOCIO')
  const casaItems    = filtered.filter(c => c.type === 'CASA')

  const negocioGroups = NEGOCIO_TIPO_ORDER
    .map(tipo => ({
      tipo,
      label: PUC_TIPO_LABEL[tipo] ?? tipo,
      items: negocioItems.filter(c => c.puc_tipo === tipo),
    }))
    .filter(g => g.items.length > 0)
  const negocioOthers = negocioItems.filter(c => !NEGOCIO_TIPO_ORDER.includes(c.puc_tipo ?? ''))

  const handleSelect = (id: string) => {
    onChange(id); setOpen(false); setSearch(''); setCreating(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const fd = new FormData()
    fd.set('name', newName.trim())
    fd.set('type', newType)
    if (newPuc) fd.set('puc_code', newPuc)
    const res = await crearCategoriaAction(fd)
    if (res.ok && res.category) {
      setCategories(prev => [...prev, res.category!])
      handleSelect(res.category!.id)
      setNewName(''); setCreating(false)
    }
    setSaving(false)
  }

  const displayValue = open ? search : (selected?.name ?? '')

  const renderItem = (c: TransactionCategory, isCasa = false) => (
    <button key={c.id} type="button" onClick={() => handleSelect(c.id)}
      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
        c.id === value
          ? isCasa
            ? 'bg-purple-100 text-purple-700 font-medium'
            : 'bg-blue-50 text-blue-700 font-medium'
          : isCasa
            ? 'hover:bg-purple-50 text-[#0F172A]'
            : 'hover:bg-[#F1F5F9] text-[#0F172A]'
      }`}>
      {c.name}
    </button>
  )

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 border border-[#E2E8F0] rounded-lg px-3 py-2.5 bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <Search size={13} className="text-[#94A3B8] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 text-sm text-[#0F172A] outline-none bg-transparent placeholder:text-[#94A3B8] min-w-0"
          placeholder={selected ? '' : 'Buscar categoría...'}
          value={displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => { setOpen(true); setSearch('') }}
        />
        {value && (
          <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setSearch('') }}>
            <X size={12} className="text-[#94A3B8] hover:text-[#64748B]" />
          </button>
        )}
        <ChevronDown size={13} className={`text-[#94A3B8] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-hidden">
          {/* Type filter tabs */}
          <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC]">
            {(['NEGOCIO', 'CASA', undefined] as const).map(t => (
              <button key={String(t)} type="button"
                onClick={() => setTypeFilter(t)}
                className={`flex-1 py-1.5 text-[10px] font-semibold transition-colors ${
                  typeFilter === t
                    ? t === 'CASA'
                      ? 'text-purple-700 border-b-2 border-purple-500 bg-purple-50'
                      : 'text-blue-700 border-b-2 border-blue-500 bg-blue-50'
                    : 'text-[#94A3B8] hover:text-[#64748B]'
                }`}>
                {t === 'NEGOCIO' ? 'Negocio' : t === 'CASA' ? 'Casa' : 'Todas'}
              </button>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {negocioGroups.map(g => (
              <div key={g.tipo}>
                <div className="px-3 py-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0">
                  {g.label}
                </div>
                {g.items.map(c => renderItem(c))}
              </div>
            ))}
            {negocioOthers.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0">
                  Operacional
                </div>
                {negocioOthers.map(c => renderItem(c))}
              </div>
            )}
            {casaItems.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-bold text-purple-400 uppercase tracking-wider bg-purple-50 border-b border-purple-100 sticky top-0">
                  Casa — Propietario
                </div>
                {casaItems.map(c => renderItem(c, true))}
              </div>
            )}
            {negocioGroups.length === 0 && negocioOthers.length === 0 && casaItems.length === 0 && (
              <p className="text-xs text-[#94A3B8] text-center py-5">Sin resultados</p>
            )}
          </div>{/* end max-h-64 */}

          <div className="border-t border-[#E2E8F0]">
            {!creating ? (
              <button type="button" onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#2563EB] hover:bg-blue-50 transition-colors font-medium">
                <Plus size={13} /> Nueva categoría
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-[#F8FAFC]">
                <p className="text-xs font-semibold text-[#64748B]">Nueva categoría</p>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Nombre"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select value={newType} onChange={e => setNewType(e.target.value as 'NEGOCIO' | 'CASA')}
                    className="border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="NEGOCIO">Negocio</option>
                    <option value="CASA">Casa</option>
                  </select>
                  <select value={newPuc} onChange={e => setNewPuc(e.target.value)}
                    className="border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="">Sin PUC</option>
                    {pucAccounts.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.codigo}>{p.codigo} · {p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setCreating(false); setNewName('') }}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] text-xs font-medium py-1.5 rounded-lg hover:bg-white transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleCreate} disabled={!newName.trim() || saving}
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
