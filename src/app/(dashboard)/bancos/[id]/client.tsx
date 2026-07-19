'use client'

import Link from 'next/link'
import { useState, useMemo, useRef } from 'react'
import { formatCOP, formatDate, formatTripOption, tripMatchesQuery } from '@/lib/utils'
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, ReceiptText,
  X, Pencil, Trash2, Sparkles, Loader2, Search, Plus, Filter, Zap,
} from 'lucide-react'
import { actualizarTransaccionAction, eliminarTransaccionAction, asignarCategoriaMasivaAction } from '../transaccion/actions'
import { recategorizarAction, sugerirCategoriaAction, type SugerirResult } from '../category-actions'
import type { Trip } from '@/lib/types'

function SourceBadge({ source }: { source: SugerirResult['source'] }) {
  if (source === 'RULES')
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Regla</span>
  if (source === 'PROVEEDOR')
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Proveedor</span>
  return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">Historial</span>
}
import TransaccionForm from '../transaccion/form'
import CategorySelector from '@/components/CategorySelector'
import SupplierSelector from '@/components/SupplierSelector'
import type { PucAccount } from '@/components/PucSelector'
import type { TransactionCategory } from '@/app/(dashboard)/bancos/category-actions'

interface Account {
  id: string
  bank_name: string
  account_number: string | null
  initial_balance: number
}

interface TxCategory {
  id: string
  name: string
  type: 'NEGOCIO' | 'CASA'
  puc_code: string | null
}

interface Transaction {
  id: string
  account_id: string
  type: 'INGRESO' | 'EGRESO'
  amount: number
  date: string
  category_id: string | null
  description: string
  source?: string
  supplier_nit?: string | null
  supplier_name?: string | null
  reference_type?: string | null
  reference_id?: string | null
  transaction_categories?: TxCategory | null
}

type TipoFilter = 'TODOS' | 'NEGOCIO' | 'CASA'
type SortCol    = 'date' | 'type' | 'category' | 'description' | 'amount'

interface EditForm {
  type: string; amount: string; date: string; category_id: string
  description: string; supplier_nit: string; supplier_name: string
  trip_id: string
}

interface Props {
  account: Account
  transactions: Transaction[]
  ingresos: number
  egresos: number
  balance: number
  categories: TransactionCategory[]
  pucAccounts: PucAccount[]
  trips: Trip[]
}

function CategoryBadge({ cat }: { cat?: TxCategory | null }) {
  if (!cat) return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
      Sin clasificar
    </span>
  )
  return (
    <div>
      <span className="text-[10px] text-[#0F172A]">{cat.name}</span>
      <p className="text-[9px] text-[#94A3B8] leading-none mt-0.5">{cat.type === 'CASA' ? 'Casa' : 'Negocio'}</p>
    </div>
  )
}

export default function BankDetailClient({
  account, transactions, ingresos, egresos, balance, categories, pucAccounts, trips,
}: Props) {
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tipoFilter,     setTipoFilter]     = useState<TipoFilter>('TODOS')
  const [searchDesc,     setSearchDesc]     = useState('')
  const [sortCol,        setSortCol]        = useState<SortCol>('date')
  const [sortDir,        setSortDir]        = useState<'asc' | 'desc'>('desc')
  const [editTxn,        setEditTxn]        = useState<Transaction | null>(null)
  const [editForm,       setEditForm]       = useState<EditForm | null>(null)
  const [editTripSearch, setEditTripSearch] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [editError,      setEditError]      = useState('')
  const [editSuggestion, setEditSuggestion] = useState<SugerirResult | null>(null)
  const editDescDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleteTxn,      setDeleteTxn]      = useState<Transaction | null>(null)
  const [deleting,       setDeleting]       = useState(false)
  const [recategorizing, setRecategorizing] = useState(false)
  const [recatMsg,       setRecatMsg]       = useState<string | null>(null)
  const [showNewTxn,     setShowNewTxn]     = useState(false)
  const [showFilters,    setShowFilters]    = useState(false)
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkAssigning,  setBulkAssigning]  = useState(false)

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filteredBase = useMemo(() => transactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo   && t.date > dateTo)   return false
    if (categoryFilter === '__sin__') {
      if (t.category_id !== null && t.transaction_categories !== null) return false
    } else if (categoryFilter) {
      if (t.category_id !== categoryFilter) return false
    }
    if (tipoFilter === 'NEGOCIO' && t.transaction_categories?.type !== 'NEGOCIO') return false
    if (tipoFilter === 'CASA'    && t.transaction_categories?.type !== 'CASA')    return false
    if (searchDesc && !t.description.toLowerCase().includes(searchDesc.toLowerCase())) return false
    return true
  }), [transactions, dateFrom, dateTo, categoryFilter, tipoFilter, searchDesc])

  const filteredIngresos = useMemo(
    () => filteredBase.filter(t => t.type === 'INGRESO').reduce((s, t) => s + Number(t.amount), 0),
    [filteredBase],
  )
  const filteredEgresos = useMemo(
    () => filteredBase.filter(t => t.type === 'EGRESO').reduce((s, t) => s + Number(t.amount), 0),
    [filteredBase],
  )

  const filtered = useMemo(() => [...filteredBase].sort((a, b) => {
    let cmp = 0
    switch (sortCol) {
      case 'date':        cmp = a.date.localeCompare(b.date); break
      case 'type':        cmp = a.type.localeCompare(b.type); break
      case 'category':    cmp = (a.transaction_categories?.name ?? '').localeCompare(b.transaction_categories?.name ?? '', 'es'); break
      case 'description': cmp = a.description.localeCompare(b.description, 'es'); break
      case 'amount':      cmp = Number(a.amount) - Number(b.amount); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  }), [filteredBase, sortCol, sortDir])

  const hasFilters = !!(dateFrom || dateTo || categoryFilter || tipoFilter !== 'TODOS' || searchDesc)

  const uniqueCategories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of transactions) {
      if (t.category_id && t.transaction_categories?.name) seen.set(t.category_id, t.transaction_categories.name)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions])

  const openEdit = (t: Transaction) => {
    setEditTxn(t)
    setEditForm({
      type: t.type, amount: String(t.amount), date: t.date,
      category_id: t.category_id ?? '', description: t.description,
      supplier_nit: t.supplier_nit ?? '', supplier_name: t.supplier_name ?? '',
      trip_id: t.reference_type === 'TRIP' ? (t.reference_id ?? '') : '',
    })
    setEditTripSearch('')
    setEditError('')
    setEditSuggestion(null)
    if (editDescDebounce.current) clearTimeout(editDescDebounce.current)
  }

  const closeEdit = () => {
    setEditTxn(null); setEditForm(null)
    setEditSuggestion(null)
    if (editDescDebounce.current) clearTimeout(editDescDebounce.current)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTxn) return
    setDeleting(true)
    const res = await eliminarTransaccionAction(deleteTxn.id)
    if (res.ok) { setDeleteTxn(null); window.location.reload() }
    else setDeleting(false)
  }

  const handleSave = async () => {
    if (!editTxn || !editForm) return
    setSaving(true); setEditError('')
    const fd = new FormData()
    fd.set('type', editForm.type); fd.set('amount', editForm.amount); fd.set('date', editForm.date)
    fd.set('category_id', editForm.category_id); fd.set('description', editForm.description)
    fd.set('supplier_nit', editForm.supplier_nit); fd.set('supplier_name', editForm.supplier_name)
    if (editForm.trip_id) {
      fd.set('reference_type', 'TRIP')
      fd.set('reference_id',   editForm.trip_id)
    }
    const result = await actualizarTransaccionAction(editTxn.id, fd)
    if (result.ok) { closeEdit(); window.location.reload() }
    else { setEditError(result.error ?? 'Error al guardar'); setSaving(false) }
  }

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setCategoryFilter(''); setTipoFilter('TODOS'); setSearchDesc('')
  }

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const handleBulkAssign = async () => {
    if (!bulkCategoryId || selectedIds.size === 0) return
    setBulkAssigning(true)
    const res = await asignarCategoriaMasivaAction([...selectedIds], bulkCategoryId)
    if (res.ok) {
      setSelectedIds(new Set()); setBulkCategoryId('')
      window.location.reload()
    } else {
      setBulkAssigning(false)
    }
  }

  const tipoBtn = (v: TipoFilter, label: string) => (
    <button onClick={() => setTipoFilter(v)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[36px] ${
        tipoFilter === v ? 'bg-[#2563EB] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
      }`}>
      {label}
    </button>
  )

  const thCls = 'text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer select-none hover:bg-[#F1F5F9] transition-colors whitespace-nowrap'
  const SortArrow = ({ col }: { col: SortCol }) => (
    <span className={`ml-0.5 ${sortCol === col ? 'text-[#2563EB]' : 'text-[#CBD5E1]'}`}>
      {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  const inpCls = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-base md:text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 md:mb-6 gap-3">
        <div className="flex items-center gap-3">
          <Link href="/bancos" className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-[#0F172A]">{account.bank_name}</h1>
            <p className="text-xs md:text-sm text-[#64748B] mt-0.5">
              {account.account_number ? `Cuenta ${account.account_number}` : 'Sin número de cuenta'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {recatMsg && <span className="text-xs text-[#64748B] hidden sm:inline">{recatMsg}</span>}
          <button
            onClick={() => setShowNewTxn(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors min-h-[40px]"
          >
            <Plus size={13} /> <span className="hidden sm:inline">Nueva transacción</span><span className="sm:hidden">Nueva</span>
          </button>
          <button
            onClick={async () => {
              setRecategorizing(true); setRecatMsg(null)
              const res = await recategorizarAction(account.id)
              setRecategorizing(false)
              if (res.ok) {
                setRecatMsg(`${res.categorized} categorizadas`)
                if (res.categorized > 0) window.location.reload()
              } else {
                setRecatMsg(`Error: ${res.error}`)
              }
            }}
            disabled={recategorizing}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors border border-purple-200 min-h-[40px]"
          >
            {recategorizing
              ? <><Loader2 size={13} className="animate-spin" /> <span className="hidden sm:inline">Categorizando...</span></>
              : <><Sparkles size={13} /> <span className="hidden sm:inline">Recategorizar</span></>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5 md:mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <p className="text-xs font-semibold text-[#64748B] mb-1 truncate">
            {hasFilters ? 'Neto filtrado' : 'Saldo actual'}
          </p>
          <p className="text-xs sm:text-sm md:text-base font-bold text-[#0F172A] truncate">
            {formatCOP(hasFilters ? filteredIngresos - filteredEgresos : balance)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <ArrowDownCircle size={12} className="text-green-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-[#64748B] truncate">Ingresos</p>
          </div>
          <p className="text-xs sm:text-sm md:text-base font-bold text-green-600 truncate">
            {formatCOP(hasFilters ? filteredIngresos : ingresos)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 md:p-4 overflow-hidden min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpCircle size={12} className="text-red-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-[#64748B] truncate">Egresos</p>
          </div>
          <p className="text-xs sm:text-sm md:text-base font-bold text-red-500 truncate">
            {formatCOP(hasFilters ? filteredEgresos : egresos)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-4">
        {/* Mobile: toggle button */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-2 w-full md:hidden mb-1"
        >
          <Filter size={14} className="text-[#64748B]" />
          <span className="text-sm font-semibold text-[#64748B]">
            Filtrar {hasFilters ? `(${filtered.length})` : ''}
          </span>
          {hasFilters && (
            <span className="ml-auto text-xs text-[#2563EB] font-medium" onClick={e => { e.stopPropagation(); clearFilters() }}>
              Limpiar
            </span>
          )}
        </button>

        <div className={`space-y-3 ${showFilters ? 'block' : 'hidden md:block'}`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full sm:w-auto border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full sm:w-auto border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="w-full sm:w-auto border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                <option value="">Todas</option>
                <option value="__sin__">Sin clasificar</option>
                {uniqueCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Buscar descripción</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input type="text" value={searchDesc} onChange={e => setSearchDesc(e.target.value)}
                  placeholder="Filtrar por texto..."
                  className="w-full border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                {searchDesc && (
                  <button onClick={() => setSearchDesc('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X size={12} className="text-[#94A3B8] hover:text-[#64748B]" />
                  </button>
                )}
              </div>
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="hidden sm:block text-xs text-[#64748B] hover:text-[#0F172A] underline transition-colors self-end pb-2">
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#64748B] mr-1">Tipo:</span>
            {tipoBtn('TODOS',   'Todas')}
            {tipoBtn('NEGOCIO', 'Negocio')}
            {tipoBtn('CASA',    'Casa')}
            <span className="ml-auto text-[10px] text-[#94A3B8]">
              {filtered.length} transacción{filtered.length !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Barra fija de acciones masivas — sticky, justo bajo los filtros */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-30 mb-3">
          <div className="bg-[#0F172A] text-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-xs font-semibold whitespace-nowrap shrink-0">
              {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex-1 min-w-0">
              <CategorySelector
                value={bulkCategoryId}
                onChange={setBulkCategoryId}
                categories={categories}
                pucAccounts={pucAccounts}
              />
            </div>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkCategoryId || bulkAssigning}
              className="shrink-0 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-semibold text-xs px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              {bulkAssigning ? 'Asignando...' : 'Asignar'}
            </button>
            <button onClick={() => { setSelectedIds(new Set()); setBulkCategoryId('') }} className="shrink-0">
              <X size={16} className="text-[#94A3B8] hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-[#2563EB] cursor-pointer"
                />
              </th>
              <th className={thCls} onClick={() => handleSort('date')}>Fecha <SortArrow col="date" /></th>
              <th className={thCls} onClick={() => handleSort('type')}>Tipo <SortArrow col="type" /></th>
              <th className={thCls} onClick={() => handleSort('category')}>Categoría <SortArrow col="category" /></th>
              <th className={thCls} onClick={() => handleSort('description')}>Descripción <SortArrow col="description" /></th>
              <th className="px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">Tercero</th>
              <th className={`${thCls} text-right`} onClick={() => handleSort('amount')}>Monto <SortArrow col="amount" /></th>
              <th className="px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Origen</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-xs text-[#64748B]">
                  <ReceiptText size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
                  No hay transacciones{hasFilters ? ' con estos filtros' : ''}
                </td>
              </tr>
            ) : filtered.map(t => {
              const isExtracto = t.source === 'EXTRACTO_BANCOLOMBIA'
              const isSelected = selectedIds.has(t.id)
              return (
                <tr key={t.id} className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-[#F8FAFC]'}`}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(t.id)}
                      className="w-3.5 h-3.5 rounded accent-[#2563EB] cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-[#64748B] whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      t.type === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {t.type === 'INGRESO' ? <ArrowDownCircle size={9} /> : <ArrowUpCircle size={9} />}
                      {t.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5"><CategoryBadge cat={t.transaction_categories} /></td>
                  <td className="px-3 py-1.5 text-xs text-[#0F172A] max-w-[220px] truncate">{t.description}</td>
                  <td className="px-3 py-1.5 text-xs text-[#94A3B8] whitespace-nowrap max-w-[140px] truncate hidden lg:table-cell">
                    {t.supplier_name ?? '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-xs font-semibold text-right whitespace-nowrap ${
                    t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {t.type === 'EGRESO' ? '−' : '+'}{formatCOP(Number(t.amount))}
                  </td>
                  <td className="px-3 py-1.5 hidden lg:table-cell">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isExtracto ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {isExtracto ? 'Extracto' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(t)}
                        className="inline-flex items-center gap-0.5 text-[10px] text-[#2563EB] hover:underline font-medium">
                        <Pencil size={10} /> Editar
                      </button>
                      <button onClick={() => setDeleteTxn(t)} className="text-[#94A3B8] hover:text-red-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#64748B]">
            <ReceiptText size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
            No hay transacciones{hasFilters ? ' con estos filtros' : ''}
          </div>
        ) : filtered.map(t => (
          <div key={t.id} className={`border border-[#E2E8F0] rounded-xl p-3 transition-colors ${selectedIds.has(t.id) ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggleRow(t.id)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-[#2563EB] cursor-pointer flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs text-[#0F172A] font-medium truncate">{t.description}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">{formatDate(t.date)}</p>
                </div>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${t.type === 'INGRESO' ? 'text-green-600' : 'text-red-500'}`}>
                {t.type === 'EGRESO' ? '−' : '+'}{formatCOP(Number(t.amount))}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  t.type === 'INGRESO' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {t.type === 'INGRESO' ? <ArrowDownCircle size={9} /> : <ArrowUpCircle size={9} />}
                  {t.type}
                </span>
                <CategoryBadge cat={t.transaction_categories} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(t)}
                  className="text-xs text-[#2563EB] font-medium min-h-[36px] px-1">Editar</button>
                <button onClick={() => setDeleteTxn(t)}
                  className="text-[#94A3B8] hover:text-red-500 min-h-[36px] px-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirm */}
      {deleteTxn && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-sm shadow-xl space-y-4">
            <h2 className="font-semibold text-[#0F172A]">Eliminar transacción</h2>
            <p className="text-sm text-[#64748B]">
              Se eliminará <span className="font-medium text-[#0F172A]">{deleteTxn.description}</span> de forma permanente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTxn(null)} disabled={deleting}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-3 rounded-lg text-sm hover:bg-[#F8FAFC]">
                Cancelar
              </button>
              <button onClick={handleDeleteConfirm} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New transaction modal */}
      {showNewTxn && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="font-semibold text-[#0F172A]">Nueva transacción</h2>
                <p className="text-xs text-[#64748B] mt-0.5">{account.bank_name}</p>
              </div>
              <button onClick={() => setShowNewTxn(false)} className="p-1">
                <X size={18} className="text-[#64748B]" />
              </button>
            </div>
            <div className="p-5 md:p-6">
              <TransaccionForm
                accounts={[]} categories={categories} pucAccounts={pucAccounts} trips={trips}
                defaultAccountId={account.id}
                onClose={() => setShowNewTxn(false)}
                onSuccess={() => { setShowNewTxn(false); window.location.reload() }}
              />
            </div>
          </div>
        </div>
      )}


      {/* Edit modal */}
      {editTxn && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 md:p-6 w-full sm:max-w-md shadow-xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-[#0F172A]">Editar transacción</h2>
              <button onClick={closeEdit} className="p-1"><X size={18} className="text-[#64748B]" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Tipo</label>
                  <select value={editForm.type} onChange={e => setEditForm(p => p && ({ ...p, type: e.target.value }))} className={inpCls}>
                    <option value="INGRESO">Ingreso</option>
                    <option value="EGRESO">Egreso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Monto (COP)</label>
                  <input type="number" min="0.01" step="0.01" value={editForm.amount}
                    onChange={e => setEditForm(p => p && ({ ...p, amount: e.target.value }))} className={inpCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Fecha</label>
                <input type="date" value={editForm.date}
                  onChange={e => setEditForm(p => p && ({ ...p, date: e.target.value }))} className={inpCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Categoría</label>
                <CategorySelector
                  key={editTxn?.id}
                  value={editForm.category_id}
                  onChange={v => setEditForm(p => p && ({ ...p, category_id: v }))}
                  categories={categories}
                  pucAccounts={pucAccounts}
                  typeFilter={editSuggestion?.categoryType}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Tercero (opcional)</label>
                <SupplierSelector nit={editForm.supplier_nit} name={editForm.supplier_name}
                  onChange={(nit, name) => setEditForm(p => p && ({ ...p, supplier_nit: nit, supplier_name: name }))} />
              </div>
              {trips.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Viaje asociado (opcional)</label>
                  <input
                    type="text"
                    value={editTripSearch}
                    onChange={e => setEditTripSearch(e.target.value)}
                    placeholder="Buscar por manifiesto, placa o ruta…"
                    className={`${inpCls} mb-2`}
                  />
                  <select value={editForm.trip_id}
                    onChange={e => setEditForm(p => p && ({ ...p, trip_id: e.target.value }))}
                    className={inpCls}>
                    <option value="">Sin viaje asociado</option>
                    {trips
                      .filter(t => t.id === editForm.trip_id || tripMatchesQuery(t, editTripSearch))
                      .map(t => (
                        <option key={t.id} value={t.id}>{formatTripOption(t)}</option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">Descripción</label>
                <textarea rows={3} value={editForm.description}
                  onChange={e => {
                    const val = e.target.value
                    setEditForm(p => p && ({ ...p, description: val }))
                    if (editDescDebounce.current) clearTimeout(editDescDebounce.current)
                    if (val.length < 4) { setEditSuggestion(null); return }
                    editDescDebounce.current = setTimeout(async () => {
                      const s = await sugerirCategoriaAction(val)
                      setEditSuggestion(s)
                    }, 400)
                  }}
                  className={`${inpCls} resize-none`} />
                {editSuggestion && (
                  <div className="mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <Zap size={12} className="text-blue-500 shrink-0" />
                    <span className="text-xs text-blue-700 flex-1">
                      Sugerido: <span className="font-semibold">{editSuggestion.categoryName}</span>
                      {' '}<SourceBadge source={editSuggestion.source} />
                      {editSuggestion.supplierName && (
                        <span className="ml-1 text-blue-400 text-[10px]">· {editSuggestion.supplierName}</span>
                      )}
                    </span>
                    <button type="button"
                      onClick={() => { setEditForm(p => p && ({ ...p, category_id: editSuggestion.categoryId })); setEditSuggestion(null) }}
                      className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-medium hover:bg-blue-700 shrink-0">
                      Usar
                    </button>
                    <button type="button" onClick={() => setEditSuggestion(null)}>
                      <X size={12} className="text-blue-400 hover:text-blue-600" />
                    </button>
                  </div>
                )}
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeEdit}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-3 rounded-lg text-sm hover:bg-[#F8FAFC]">
                  Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
