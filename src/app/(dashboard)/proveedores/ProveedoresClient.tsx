'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { type MergedRow } from './actions'
import { Truck, Search, Mail, Phone, AlertTriangle, Users, Lock, ArrowRight } from 'lucide-react'
import { useUrlState } from '@/lib/useUrlState'

const PARTY_LABELS: Record<string, string> = {
  PERSONA_JURIDICA: 'Jurídica',
  PERSONA_NATURAL:  'Natural',
}

type Filter = 'PROVEEDORES' | 'CLIENTES' | 'TODOS'

// Pantalla de SOLO LECTURA. La gestión de proveedores/clientes se hace ahora desde
// /terceros — las tablas legacy (`suppliers`, `supplier_catalog`) ya no se crean/editan
// aquí para cerrar la puerta trasera que no pasaba por terceros.

export default function ProveedoresClient({ initial }: { initial: MergedRow[] }) {
  const [filter, setFilter] = useUrlState('tipo', 'TODOS') as [Filter, (v: Filter) => void]
  const [search, setSearch] = useUrlState('q')

  const clientes    = useMemo(() => initial.filter(r => r.is_client), [initial])
  const proveedores = useMemo(() => initial.filter(r => !r.is_client), [initial])
  const duplicados  = useMemo(() => initial.filter(r => r.exists_in_clients), [initial])

  const base = filter === 'CLIENTES' ? clientes : filter === 'PROVEEDORES' ? proveedores : initial
  const filtered = base.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.nit ?? '').includes(search) ||
    (r.email ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const TABS: { id: Filter; label: string; count: number }[] = [
    { id: 'TODOS',       label: 'Todos',       count: initial.length },
    { id: 'PROVEEDORES', label: 'Proveedores', count: proveedores.length },
    { id: 'CLIENTES',    label: 'Clientes',    count: clientes.length },
  ]

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Proveedores y clientes</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Fusión de <span className="font-medium">suppliers</span> + <span className="font-medium">supplier_catalog</span> · {initial.length} registros
          </p>
        </div>
      </div>

      {/* Banner solo-lectura */}
      <div className="flex items-start gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 mb-4">
        <Lock size={16} className="text-[#94A3B8] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[#475569]">
          <span className="font-medium text-[#0F172A]">Solo lectura.</span>{' '}
          La gestión de proveedores y clientes ahora se hace desde{' '}
          <Link href="/terceros" className="text-[#2563EB] font-medium hover:underline inline-flex items-center gap-0.5">
            Terceros <ArrowRight size={12} />
          </Link>
          . Esta vista legacy queda solo para consulta.
        </div>
      </div>

      {/* Aviso de duplicados */}
      {duplicados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {duplicados.length} NIT también existe{duplicados.length !== 1 ? 'n' : ''} en la tabla de clientes
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Estos registros están tanto en clientes como en proveedores/catálogo.
            </p>
          </div>
        </div>
      )}

      {/* Filtro + búsqueda */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === t.id ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}>
              {t.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E2E8F0] text-[#64748B] font-bold">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 w-72">
          <Search size={14} className="text-[#64748B] flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, NIT o email…"
            className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre / Razón social</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">NIT</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Categoría</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Email</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Teléfono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-14">
                    <Truck size={32} className="text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">Sin resultados</p>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.key} className="hover:bg-[#F8FAFC] transition-colors align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-medium text-[#0F172A]">{r.name}</p>
                      {r.is_client && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          <Users size={9} /> Cliente
                        </span>
                      )}
                      {r.exists_in_clients && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Ya es cliente</span>
                      )}
                      {r.dataico_id && <span className="text-[10px] text-[#2563EB]">● Dataico</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{r.nit || '—'}</td>
                  <td className="px-3 py-2">
                    {r.categoria ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.is_client ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>{r.categoria}</span>
                    ) : r.category ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {PARTY_LABELS[r.category] ?? r.category}
                      </span>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                        <Mail size={11} />{r.email}
                      </a>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.phone ? (
                      <span className="flex items-center gap-1 text-xs text-[#64748B]"><Phone size={11} />{r.phone}</span>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
