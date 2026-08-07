'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { Search, Building, Lock, ArrowRight } from 'lucide-react'
import { useUrlState } from '@/lib/useUrlState'

interface Cliente {
  id: string
  name: string
  nit: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  created_at: string
  dataico_id: string | null
  third_party_type: string | null
  account_code: string | null
}

// Pantalla de SOLO LECTURA. La gestión de clientes se hace ahora desde /terceros — esta
// tabla legacy (`clients`) ya no se crea/edita aquí para evitar la puerta trasera que
// dejaba huérfanos sin tercero_id (ver investigación de puerta trasera).

export default function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const [search, setSearch] = useUrlState('q')

  const filtered = clientes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.nit ?? '').includes(search),
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-[#0F172A]">Clientes</h1>
          <p className="text-xs text-[#64748B] mt-0.5">{clientes.length} clientes registrados</p>
        </div>
      </div>

      {/* Banner solo-lectura */}
      <div className="flex items-start gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 mb-4">
        <Lock size={16} className="text-[#94A3B8] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[#475569]">
          <span className="font-medium text-[#0F172A]">Solo lectura.</span>{' '}
          La gestión de clientes ahora se hace desde{' '}
          <Link href="/terceros" className="text-[#2563EB] font-medium hover:underline inline-flex items-center gap-0.5">
            Terceros <ArrowRight size={12} />
          </Link>
          . Esta vista legacy queda solo para consulta.
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 mb-4 w-full sm:w-72">
        <Search size={14} className="text-[#64748B] flex-shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o NIT..."
          className="text-sm text-[#0F172A] outline-none flex-1 bg-transparent" />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Nombre</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">NIT</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Telefono</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider hidden lg:table-cell">Email</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Tipo</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-xs text-[#64748B]">
                <Building size={28} className="mx-auto mb-2 text-[#CBD5E1]" />No hay clientes
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-3 py-2">
                  <p className="text-xs font-medium text-[#0F172A]">{c.name}</p>
                  {c.dataico_id && <p className="text-[10px] text-[#94A3B8] mt-0.5">Dataico</p>}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-[#64748B]">{c.nit ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{c.phone ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B] hidden lg:table-cell">{c.email ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                    c.third_party_type === 'PROVEEDOR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>{c.third_party_type ?? 'CLIENTE'}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#64748B]">
            <Building size={28} className="mx-auto mb-2 text-[#CBD5E1]" />No hay clientes
          </div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{c.name}</p>
                {c.nit && <p className="text-xs font-mono text-[#64748B] mt-0.5">{c.nit}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  c.third_party_type === 'PROVEEDOR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>{c.third_party_type ?? 'CLIENTE'}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {c.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
            {(c.phone || c.email) && (
              <p className="text-xs text-[#64748B] mt-1.5">
                {[c.phone, c.email].filter(Boolean).join(' · ')}
              </p>
            )}
            {c.created_at && <p className="text-[10px] text-[#94A3B8] mt-1">Alta: {formatDate(c.created_at)}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
