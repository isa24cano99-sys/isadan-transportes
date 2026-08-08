'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Plus, Users, GitMerge, X, Search } from 'lucide-react'
import { calcularDV, esNitConDVPegado, normalizarIdentificacion, validarIdentificacion } from '@/lib/nit'
import { guardarTerceroAction, fusionarTerceroAction, type TerceroForm } from './actions'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export type TerceroRow = {
  id: string
  tipo_persona: string
  tipo_documento: string
  numero_identificacion: string
  digito_verificacion: number | null
  razon_social: string | null
  primer_apellido: string | null
  segundo_apellido: string | null
  primer_nombre: string | null
  otros_nombres: string | null
  direccion: string | null
  codigo_pais: string | null
  codigo_departamento: string | null
  codigo_municipio: string | null
  email: string | null
  telefono: string | null
  es_cliente: boolean
  es_proveedor: boolean
  cuenta_puc_sugerida: string | null
  completo: boolean
  monto: number
  registros: number
}
export type Municipio = { codigo_departamento: string; nombre_departamento: string; codigo_municipio: string; nombre_municipio: string }
export type DuplicadoPar = {
  sobreviviente: { id: string; numero: string; nombre: string; registros: number; monto: number }
  duplicado:     { id: string; numero: string; nombre: string; registros: number; monto: number }
}

const TIPOS_DOC: [string, string][] = [
  ['31', 'NIT'], ['13', 'Cédula de ciudadanía'], ['12', 'Tarjeta de identidad'], ['11', 'Registro civil'],
  ['21', 'Tarjeta de extranjería'], ['22', 'Cédula de extranjería'], ['41', 'Pasaporte'],
  ['42', 'Documento extranjero'], ['50', 'NIT de otro país'], ['91', 'NUIP'],
]

const emptyForm = (): TerceroForm => ({
  tipo_persona: 'JURIDICA', tipo_documento: '31', numero_identificacion: '', digito_verificacion: '',
  razon_social: '', primer_apellido: '', segundo_apellido: '', primer_nombre: '', otros_nombres: '',
  direccion: '', codigo_pais: '169', codigo_departamento: '', codigo_municipio: '', email: '', telefono: '',
  es_cliente: false, es_proveedor: false, cuenta_puc_sugerida: '',
})

const nombreDe = (t: { razon_social: string | null; primer_nombre: string | null }) =>
  t.razon_social || t.primer_nombre || '(sin nombre)'

// minúsculas + sin acentos, para búsqueda case/acento-insensible
const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function TercerosClient({
  terceros, municipios, duplicados, municipiosDisponibles,
}: {
  terceros: TerceroRow[]
  municipios: Municipio[]
  duplicados: DuplicadoPar[]
  municipiosDisponibles: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'lista' | 'duplicados'>('lista')
  const [editId, setEditId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<TerceroForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fusion, setFusion] = useState<DuplicadoPar | null>(null)
  const [fusionando, setFusionando] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  // Filtro de la lista: si la consulta es numérica → por identificación (substring);
  // si es texto → por nombre/razón social completo, case- y acento-insensible.
  const tercerosFiltrados = useMemo(() => {
    const q = busqueda.trim()
    if (!q) return terceros
    const soloDigitos = /^[\d\s.\-]+$/.test(q)
    const qd = q.replace(/\D/g, '')
    const qn = norm(q)
    return terceros.filter(t => {
      if (soloDigitos) return qd !== '' && t.numero_identificacion.includes(qd)
      const nombre = norm([t.razon_social, t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido].filter(Boolean).join(' '))
      return nombre.includes(qn)
    })
  }, [terceros, busqueda])

  const departamentos = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of municipios) m.set(x.codigo_departamento, x.nombre_departamento)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [municipios])
  const municipiosDeDept = useMemo(
    () => municipios.filter(m => m.codigo_departamento === form.codigo_departamento)
                    .sort((a, b) => a.nombre_municipio.localeCompare(b.nombre_municipio)),
    [municipios, form.codigo_departamento],
  )

  const numero = normalizarIdentificacion(form.numero_identificacion)
  const esNit = form.tipo_documento === '31'
  const dvCalc = esNit && numero ? calcularDV(numero) : null
  const pegado = esNit ? esNitConDVPegado(numero) : null
  const validationErr = validarIdentificacion(form.tipo_documento, numero, esNit ? (dvCalc ?? null) : null)

  const abrirEdicion = (t: TerceroRow) => {
    setCreando(false); setEditId(t.id); setError('')
    setForm({
      tipo_persona: t.tipo_persona, tipo_documento: t.tipo_documento, numero_identificacion: t.numero_identificacion,
      digito_verificacion: t.digito_verificacion ?? '', razon_social: t.razon_social ?? '',
      primer_apellido: t.primer_apellido ?? '', segundo_apellido: t.segundo_apellido ?? '',
      primer_nombre: t.primer_nombre ?? '', otros_nombres: t.otros_nombres ?? '',
      direccion: t.direccion ?? '', codigo_pais: t.codigo_pais ?? '169',
      codigo_departamento: t.codigo_departamento ?? '', codigo_municipio: t.codigo_municipio ?? '',
      email: t.email ?? '', telefono: t.telefono ?? '',
      es_cliente: t.es_cliente, es_proveedor: t.es_proveedor, cuenta_puc_sugerida: t.cuenta_puc_sugerida ?? '',
    })
  }
  const abrirNuevo = () => { setCreando(true); setEditId(null); setForm(emptyForm()); setError('') }
  const cerrar = () => { setEditId(null); setCreando(false); setError('') }

  const guardar = async () => {
    if (validationErr) { setError(validationErr); return }
    setSaving(true); setError('')
    const payload: TerceroForm = { ...form, numero_identificacion: numero, digito_verificacion: esNit ? (dvCalc ?? '') : '' }
    const res = await guardarTerceroAction(editId, payload)
    setSaving(false)
    if (res.ok) { cerrar(); router.refresh() }
    else setError(res.error ?? 'No se pudo guardar')
  }

  const confirmarFusion = async () => {
    if (!fusion) return
    setFusionando(true)
    const res = await fusionarTerceroAction(fusion.sobreviviente.id, fusion.duplicado.id)
    setFusionando(false)
    if (res.ok) { setFusion(null); router.refresh() }
    else setError(res.error ?? 'No se pudo fusionar')
  }

  const incompletos = terceros.filter(t => !t.completo).length
  const inp = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB]'
  const lbl = 'block text-xs font-semibold text-[#64748B] mb-1'

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A] flex items-center gap-2"><Users size={20} /> Terceros</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            {busqueda ? `${tercerosFiltrados.length} de ${terceros.length}` : terceros.length} terceros · <span className="text-amber-700 font-medium">{incompletos} incompletos</span> (exógena/1001)
          </p>
        </div>
        <button onClick={abrirNuevo} className="inline-flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={15} /> Nuevo tercero
        </button>
      </div>

      {!municipiosDisponibles && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          El catálogo <strong>municipios_dane</strong> aún no está sembrado — el selector de departamento/municipio estará vacío hasta cargar el CSV.
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => setTab('lista')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === 'lista' ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Lista</button>
        <button onClick={() => setTab('duplicados')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 ${tab === 'duplicados' ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
          <GitMerge size={13} /> Duplicados ({duplicados.length})
        </button>
        {tab === 'lista' && (
          <div className="relative w-full sm:w-80 sm:ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por NIT o nombre…"
              className="w-full pl-8 pr-8 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {tab === 'lista' && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Nombre / Razón social</th>
                  <th className="text-left px-3 py-2">Identificación</th>
                  <th className="text-left px-3 py-2">Rol</th>
                  <th className="text-right px-3 py-2">$ asociado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {tercerosFiltrados.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-[#94A3B8]">
                    Sin resultados para “{busqueda}”.
                  </td></tr>
                )}
                {tercerosFiltrados.map(t => (
                  <tr key={t.id} className={`hover:bg-[#F8FAFC] ${!t.completo ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2">
                      {t.completo
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700"><Check size={10} /> Completo</span>
                        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Incompleto</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0F172A]">{nombreDe(t)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#475569]">{t.tipo_documento === '31' ? `${t.numero_identificacion}-${t.digito_verificacion ?? '?'}` : t.numero_identificacion}</td>
                    <td className="px-3 py-2 text-xs text-[#64748B]">{[t.es_cliente && 'Cliente', t.es_proveedor && 'Proveedor'].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0F172A]">{t.monto ? COP.format(t.monto) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => abrirEdicion(t)} className="text-xs font-medium text-[#2563EB] hover:underline">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'duplicados' && (
        <div className="space-y-3">
          {duplicados.length === 0 && <p className="text-sm text-[#64748B] px-1">No hay duplicados por identificación detectados.</p>}
          {duplicados.map((d, i) => (
            <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <p className="text-[#0F172A]"><span className="font-semibold">{d.sobreviviente.numero}</span> {d.sobreviviente.nombre} <span className="text-[#94A3B8]">({d.sobreviviente.registros} filas)</span></p>
                <p className="text-red-600 mt-0.5">⟷ {d.duplicado.numero} {d.duplicado.nombre} <span className="text-[#94A3B8]">({d.duplicado.registros} filas · {COP.format(d.duplicado.monto)})</span></p>
              </div>
              <button onClick={() => setFusion(d)} className="inline-flex items-center gap-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-medium px-3 py-2 rounded-lg">
                <GitMerge size={13} /> Fusionar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Panel de edición */}
      {(editId || creando) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={cerrar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#0F172A]">{creando ? 'Nuevo tercero' : 'Editar tercero'}</h2>
              <button onClick={cerrar}><X size={18} className="text-[#64748B]" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Tipo persona</label>
                <select className={inp} value={form.tipo_persona} onChange={e => setForm(f => ({ ...f, tipo_persona: e.target.value }))}>
                  <option value="JURIDICA">Jurídica</option><option value="NATURAL">Natural</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Tipo documento</label>
                <select className={inp} value={form.tipo_documento} onChange={e => setForm(f => ({ ...f, tipo_documento: e.target.value }))}>
                  {TIPOS_DOC.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Número identificación</label>
                <input className={inp} value={form.numero_identificacion} onChange={e => setForm(f => ({ ...f, numero_identificacion: e.target.value }))} inputMode="numeric" />
              </div>
              <div>
                <label className={lbl}>Dígito de verificación {esNit && <span className="text-[#94A3B8]">(auto)</span>}</label>
                <input className={`${inp} ${esNit ? 'bg-[#F8FAFC]' : ''}`} value={esNit ? (dvCalc ?? '') : ''} readOnly disabled={!esNit} placeholder={esNit ? '' : 'N/A'} />
              </div>
              {pegado && (
                <p className="col-span-2 text-xs text-red-600 -mt-1">⚠ Ese número trae el DV pegado. Usa la base <strong>{pegado.base}</strong> (DV {pegado.dv}).</p>
              )}

              {form.tipo_persona === 'JURIDICA' ? (
                <div className="col-span-2">
                  <label className={lbl}>Razón social</label>
                  <input className={inp} value={form.razon_social ?? ''} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
                </div>
              ) : (
                <>
                  <div><label className={lbl}>Primer nombre</label><input className={inp} value={form.primer_nombre ?? ''} onChange={e => setForm(f => ({ ...f, primer_nombre: e.target.value }))} /></div>
                  <div><label className={lbl}>Otros nombres</label><input className={inp} value={form.otros_nombres ?? ''} onChange={e => setForm(f => ({ ...f, otros_nombres: e.target.value }))} /></div>
                  <div><label className={lbl}>Primer apellido</label><input className={inp} value={form.primer_apellido ?? ''} onChange={e => setForm(f => ({ ...f, primer_apellido: e.target.value }))} /></div>
                  <div><label className={lbl}>Segundo apellido</label><input className={inp} value={form.segundo_apellido ?? ''} onChange={e => setForm(f => ({ ...f, segundo_apellido: e.target.value }))} /></div>
                </>
              )}

              <div className="col-span-2"><label className={lbl}>Dirección</label><input className={inp} value={form.direccion ?? ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div>
              <div>
                <label className={lbl}>Departamento</label>
                <select className={inp} value={form.codigo_departamento ?? ''} onChange={e => setForm(f => ({ ...f, codigo_departamento: e.target.value, codigo_municipio: '' }))}>
                  <option value="">— Seleccionar —</option>
                  {departamentos.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Municipio</label>
                <select className={inp} value={form.codigo_municipio ?? ''} onChange={e => setForm(f => ({ ...f, codigo_municipio: e.target.value }))} disabled={!form.codigo_departamento}>
                  <option value="">— Seleccionar —</option>
                  {municipiosDeDept.map(m => <option key={m.codigo_municipio} value={m.codigo_municipio}>{m.codigo_municipio} · {m.nombre_municipio}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Email</label><input className={inp} value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className={lbl}>Teléfono</label><input className={inp} value={form.telefono ?? ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
              <div className="col-span-2 flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-[#374151]"><input type="checkbox" checked={!!form.es_cliente} onChange={e => setForm(f => ({ ...f, es_cliente: e.target.checked }))} /> Es cliente</label>
                <label className="flex items-center gap-2 text-sm text-[#374151]"><input type="checkbox" checked={!!form.es_proveedor} onChange={e => setForm(f => ({ ...f, es_proveedor: e.target.checked }))} /> Es proveedor</label>
              </div>
            </div>

            {(error || validationErr) && <p className="text-sm text-red-600 mt-3 font-medium">{error || validationErr}</p>}
            <div className="flex gap-3 pt-4">
              <button onClick={cerrar} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm hover:bg-[#F8FAFC]">Cancelar</button>
              <button onClick={guardar} disabled={saving || !!validationErr} className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar fusión — muestra filas a mover ANTES de confirmar */}
      {fusion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !fusionando && setFusion(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-[#0F172A]">Fusionar terceros</h2>
            <p className="text-sm text-[#64748B]">
              Se moverán las filas de <span className="font-mono">{fusion.duplicado.numero}</span> ({fusion.duplicado.nombre}) al sobreviviente <span className="font-mono font-semibold">{fusion.sobreviviente.numero}</span> ({fusion.sobreviviente.nombre}).
            </p>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-sm">
              <p><strong>{fusion.duplicado.registros}</strong> filas asociadas al duplicado se repuntan al sobreviviente.</p>
              <p className="text-xs text-[#94A3B8] mt-1">Las facturas ya emitidas (invoices) NO se tocan. La operación es atómica y verifica que no queden huérfanos.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setFusion(null)} disabled={fusionando} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-medium py-2.5 rounded-lg text-sm disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarFusion} disabled={fusionando} className="flex-1 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm">{fusionando ? 'Fusionando…' : 'Confirmar fusión'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
