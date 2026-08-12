import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import Link from 'next/link'
import { AlertTriangle, Clock, FileText, Receipt } from 'lucide-react'

function getDaysLeft(expirationDate: string | null): number | undefined {
  if (!expirationDate) return undefined
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expirationDate + 'T00:00:00')
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000)
}

const CATEGORY_LABELS: Record<string, string> = {
  SOAT:          'SOAT',
  TECNOMECANICA: 'Tecnomecánica',
  POLIZA:        'Póliza',
  CONTRATO:      'Contrato',
  LICENCIA:      'Licencia',
  RUT:           'RUT',
  OTRO:          'Otro',
}

const ENTITY_LABELS: Record<string, string> = {
  VEHICULO:  'Vehículo',
  CONDUCTOR: 'Conductor',
  EMPRESA:   'Empresa',
  OTRO:      'Otro',
}

async function getExpiringDocs() {
  const data = await fetchAll<any>((from, to) => supabase
    .from('documents')
    .select('id, category, entity_type, entity_id, file_name, expiration_date')
    .not('expiration_date', 'is', null)
    .order('expiration_date', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))

  const vehicles: { id: string; plate: string }[]      = []
  const drivers:  { id: string; full_name: string }[]   = []

  const vehicleIds = [...new Set(data.filter((d: any) => d.entity_type === 'VEHICULO').map((d: any) => d.entity_id).filter(Boolean))]
  const driverIds  = [...new Set(data.filter((d: any) => d.entity_type === 'CONDUCTOR').map((d: any) => d.entity_id).filter(Boolean))]

  if (vehicleIds.length) {
    const { data: v } = await supabase.from('vehicles').select('id, plate').in('id', vehicleIds)
    vehicles.push(...(v ?? []))
  }
  if (driverIds.length) {
    const { data: d } = await supabase.from('drivers').select('id, full_name').in('id', driverIds)
    drivers.push(...(d ?? []))
  }

  const vehicleMap = new Map(vehicles.map(v => [v.id, v.plate]))
  const driverMap  = new Map(drivers.map(d => [d.id, d.full_name]))

  return data.map((doc: any) => {
    let entityName = ''
    if (doc.entity_type === 'VEHICULO')  entityName = vehicleMap.get(doc.entity_id) ?? ''
    if (doc.entity_type === 'CONDUCTOR') entityName = driverMap.get(doc.entity_id)  ?? ''
    if (doc.entity_type === 'EMPRESA')   entityName = 'Empresa'
    return { ...doc, entityName, daysLeft: getDaysLeft(doc.expiration_date) }
  }).filter((d: any) => d.daysLeft !== undefined && d.daysLeft < 60)
}

async function getPendingBilling() {
  const data = await fetchAll<any>((from, to) => supabase
    .from('trips')
    .select('id, freight_value')
    .eq('status', 'FINALIZADO')
    .is('dataico_invoice_id', null)
    .order('id', { ascending: true })
    .range(from, to))
  const trips = data
  return {
    count: trips.length,
    total: trips.reduce((s, t) => s + Number(t.freight_value ?? 0), 0),
  }
}

async function getUnclassified() {
  const data = await fetchAll<any>((from, to) => supabase
    .from('bank_transactions')
    .select('amount, account_id')
    .is('category_id', null)
    .order('id', { ascending: true })
    .range(from, to))
  const rows = data as any[]
  const accCount: Record<string, number> = {}
  for (const t of rows) if (t.account_id) accCount[t.account_id] = (accCount[t.account_id] ?? 0) + 1
  return {
    count:     rows.length,
    total:     rows.reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0),
    accountId: Object.entries(accCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  }
}

export default async function DashboardPage() {
  const [expiringDocs, pendingBilling, unclassified] = await Promise.all([
    getExpiringDocs(),
    getPendingBilling(),
    getUnclassified(),
  ])

  const redDocs    = expiringDocs.filter((d: any) => d.daysLeft < 30)
  const yellowDocs = expiringDocs.filter((d: any) => d.daysLeft >= 30)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Dashboard</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Bienvenido a ISADAN Transportes</p>
      </div>

      {/* Pending billing KPI */}
      <Link href="/viajes?tab=por_facturar"
        className={`flex items-center gap-4 rounded-2xl border p-4 md:p-5 transition-colors hover:shadow-sm ${
          pendingBilling.count > 0
            ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100/60'
            : 'bg-green-50 border-green-200 hover:bg-green-100/60'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          pendingBilling.count > 0 ? 'bg-yellow-100' : 'bg-green-100'
        }`}>
          <Receipt size={18} className={pendingBilling.count > 0 ? 'text-yellow-700' : 'text-green-700'} />
        </div>
        <div className="flex-1 min-w-0">
          {pendingBilling.count > 0 ? (
            <>
              <p className="text-sm font-semibold text-yellow-900">
                {pendingBilling.count} viaje{pendingBilling.count !== 1 ? 's' : ''} pendiente{pendingBilling.count !== 1 ? 's' : ''} de facturar
              </p>
              <p className="text-xs text-yellow-700 mt-0.5">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(pendingBilling.total)} en fletes sin factura
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-green-900">Facturación al día</p>
              <p className="text-xs text-green-700 mt-0.5">Todos los viajes finalizados tienen factura</p>
            </>
          )}
        </div>
        <span className={`text-xs font-medium flex-shrink-0 ${
          pendingBilling.count > 0 ? 'text-yellow-700' : 'text-green-700'
        }`}>Ver →</span>
      </Link>

      {/* Transacciones sin clasificar KPI */}
      {unclassified.count > 0 && (
        <Link href={unclassified.accountId ? `/bancos/${unclassified.accountId}?cat=__sin__` : '/bancos'}
          className="flex items-center gap-4 rounded-2xl border p-4 md:p-5 transition-colors hover:shadow-sm bg-yellow-50 border-yellow-200 hover:bg-yellow-100/60"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-yellow-100">
            <AlertTriangle size={18} className="text-yellow-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-900">
              {unclassified.count} transacción{unclassified.count !== 1 ? 'es' : ''} sin clasificar — {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(unclassified.total)} pendientes
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">Asigna una categoría para que entren al Estado de Resultados</p>
          </div>
          <span className="text-xs font-medium flex-shrink-0 text-yellow-700">Clasificar →</span>
        </Link>
      )}

      {expiringDocs.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">Alertas de documentos</h2>
                <p className="text-xs text-[#64748B]">{expiringDocs.length} documento{expiringDocs.length !== 1 ? 's' : ''} requieren atención</p>
              </div>
            </div>
            <Link href="/documentos" className="text-xs font-medium text-[#2563EB] hover:underline flex-shrink-0">
              Ver todos →
            </Link>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {redDocs.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {redDocs.length} vencido{redDocs.length !== 1 ? 's' : ''} / urgente{redDocs.length !== 1 ? 's' : ''}
              </span>
            )}
            {yellowDocs.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                {yellowDocs.length} próximo{yellowDocs.length !== 1 ? 's' : ''} a vencer
              </span>
            )}
          </div>

          <div className="space-y-2">
            {expiringDocs.slice(0, 8).map((doc: any) => {
              const isRed = doc.daysLeft < 30
              return (
                <div
                  key={doc.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    isRed ? 'bg-red-50 border border-red-100' : 'bg-yellow-50 border border-yellow-100'
                  }`}
                >
                  <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                    isRed ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    {isRed
                      ? <AlertTriangle size={13} className="text-red-600" />
                      : <Clock        size={13} className="text-yellow-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{doc.file_name}</p>
                    <p className="text-xs text-[#64748B]">
                      {CATEGORY_LABELS[doc.category] ?? doc.category}
                      {doc.entityName ? ` · ${ENTITY_LABELS[doc.entity_type] ?? ''} ${doc.entityName}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-[11px] font-bold ${isRed ? 'text-red-600' : 'text-yellow-700'}`}>
                      {doc.daysLeft < 0 ? 'Vencido' : doc.daysLeft === 0 ? 'Hoy' : `${doc.daysLeft}d`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {expiringDocs.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 md:p-5 flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText size={16} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#0F172A]">Documentos al día</p>
            <p className="text-xs text-[#64748B]">No hay documentos que venzan en los próximos 60 días</p>
          </div>
        </div>
      )}
    </div>
  )
}
