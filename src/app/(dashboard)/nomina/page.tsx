import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/supabase-fetch'
import { getHistoriaNomina } from './historia'
import HistoriaNomina from './HistoriaNomina'
import CausarNominaClient from './CausarNominaClient'
import { getEstadoPagoNominaAction } from './causar-actions'
import SeguridadSocialClient from './SeguridadSocialClient'
import { getResumenSSAction, getEstadoPagoSSAction } from './pila-actions'
import { PrestacionesClient } from './PrestacionesClient'
import NominaClient from './NominaClient'
import PlanillaSegSocialClient from './PlanillaSegSocialClient'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'historia',      label: 'Historia por mes' },
  { key: 'causar',        label: 'Causar nómina' },
  { key: 'pila',          label: 'Seguridad social (PILA)' },
  { key: 'prestaciones',  label: 'Prestaciones' },
  { key: 'planillas',     label: 'Planillas anteriores' },
] as const
type Tab = (typeof TABS)[number]['key']

// ── Datos de cada pestaña (solo se leen los de la pestaña activa) ─────────────

async function datosCausar() {
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, tercero_id, salary, auxilio_transporte')
    .eq('active', true)
    .not('tercero_id', 'is', null)
    .order('full_name')

  // fondos de pensión por NIT conocido (verificados contra PILA); Protección es el sugerido
  const FONDOS_NIT = ['800229739', '900336004'] // Protección (NIT correcto PILA), Colpensiones
  const { data: fondosRaw } = await supabase
    .from('terceros')
    .select('id, razon_social, numero_identificacion')
    .in('numero_identificacion', FONDOS_NIT)
    .is('merged_into', null)

  const fondos = (fondosRaw ?? []).map(f => ({
    id: f.id as string,
    nombre: (f.razon_social ?? f.numero_identificacion) as string,
    esDefault: f.numero_identificacion === '800229739',
  }))
  const conductores = (drivers ?? []).map(d => ({
    terceroId: d.tercero_id as string,
    nombre: d.full_name as string,
    salario: Number(d.salary ?? 0),
    auxilio: Number((d as { auxilio_transporte?: number }).auxilio_transporte ?? 0),
  }))
  const pagoNomina = await getEstadoPagoNominaAction()
  return { conductores, fondos, pagoNomina }
}

// Mes por defecto de la PILA: el mes anterior al actual (nunca antes de julio 2026, el primer mes post-corte).
function mesPilaPorDefecto() {
  const hoy = new Date()
  let y = hoy.getFullYear(), m = hoy.getMonth()   // getMonth() = mes actual − 1 → el mes anterior en base 1
  if (m === 0) { m = 12; y -= 1 }
  if (y < 2026 || (y === 2026 && m < 7)) { y = 2026; m = 7 }
  return { year: y, month: m }
}

async function datosPrestaciones() {
  const [empsRes, drvsRes, { data: historial }] = await Promise.all([
    supabase.from('employees').select('id, full_name, document, hire_date, salary, active').eq('active', true).order('full_name'),
    supabase.from('drivers').select('id, full_name, document, hire_date, salary, active').eq('active', true).order('full_name'),
    supabase
      .from('social_benefits')
      .select('*, employees(full_name, document, hire_date, salary), drivers(full_name, document, hire_date, salary)')
      .eq('paid', true)
      .order('paid_date', { ascending: false }),
  ])
  const personas = [
    ...(empsRes.data ?? []).map(e => ({ ...e, sourceType: 'empleado' as const })),
    ...(drvsRes.data ?? []).map(d => ({ ...d, sourceType: 'conductor' as const })),
  ].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'))
  return { personas, historial: historial ?? [] }
}

async function datosPlanillas() {
  const [{ data: driversRaw }, payrolls, { data: bankAccounts }] = await Promise.all([
    supabase.from('drivers').select('id, full_name, document, salary, hire_date, active').eq('active', true).order('full_name'),
    fetchAll<any>((from, to) => supabase
      .from('payroll')
      .select('id, driver_id, year, month, period, net_payment, paid, paid_date, base_salary, total_percentage, total_favor_conductor, total_favor_empresa, prima, other_additions, other_deductions, notes')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)),
    supabase.from('bank_accounts').select('id, bank_name').order('bank_name'),
  ])
  const payrollByDriver = new Map<string, typeof payrolls>()
  for (const p of payrolls) {
    const arr = payrollByDriver.get(p.driver_id) ?? []
    arr.push(p)
    payrollByDriver.set(p.driver_id, arr)
  }
  const drivers = (driversRaw ?? []).map(d => ({ ...d, payrollHistory: payrollByDriver.get(d.id) ?? [] }))
  return { drivers, bankAccounts: bankAccounts ?? [] }
}

// ── Página ──────────────────────────────────────────────────────────────────────

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp  = await searchParams
  const tab = (TABS.find(t => t.key === sp.tab)?.key ?? 'historia') as Tab

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-[#0F172A]">Nómina y prestaciones</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Causar la nómina del mes, pagarla, la seguridad social y las prestaciones — con la historia de cada mes y su asiento.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-[#E2E8F0] overflow-x-auto" aria-label="Secciones de nómina">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={t.key === 'historia' ? '/nomina' : `/nomina?tab=${t.key}`}
            className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'historia' && <Historia />}
      {tab === 'causar' && <Causar />}
      {tab === 'pila' && <Pila />}
      {tab === 'prestaciones' && <Prestaciones />}
      {tab === 'planillas' && <Planillas />}
    </div>
  )
}

async function Historia() {
  const historia = await getHistoriaNomina()
  return <HistoriaNomina historia={historia} />
}

async function Causar() {
  const { conductores, fondos, pagoNomina } = await datosCausar()
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-[#64748B]">
        Registra la nómina contable de un conductor (DB gastos 5205x / CR por pagar 250505·2510·2520·2525·2370·2380).
        Los valores se derivan del salario registrado en Conductores con las fórmulas legales verificadas; ajusta
        «Días trabajados» para meses parciales o «Ajustar manualmente» para excepciones reales.
      </p>
      <CausarNominaClient conductores={conductores} fondos={fondos} pagoNomina={pagoNomina} />
    </div>
  )
}

async function Pila() {
  const { year, month } = mesPilaPorDefecto()
  const periodo = `${year}-${String(month).padStart(2, '0')}`
  const [resumen, estadoPago] = await Promise.all([getResumenSSAction(periodo), getEstadoPagoSSAction()])
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-[#64748B]">
        Consolida el pasivo de aportes de las 4 cuentas (EPS, ARL, Caja, Fondo por entidad) en un solo pasivo con
        Aportes en Línea (23709510) y registra su pago desde el banco. Confirmación manual.
      </p>
      <SeguridadSocialClient initialYear={year} initialMonth={month} initialResumen={resumen} initialEstadoPago={estadoPago} />
    </div>
  )
}

async function Prestaciones() {
  const { personas, historial } = await datosPrestaciones()
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#64748B] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-3xl">
        Aquí se liquidan y se llevan las prestaciones pagadas como <span className="font-medium">registro informativo</span>.
        La provisión mensual ya se causa con la nómina (ver «Prestaciones provisionadas» en la historia); el pago de
        prestaciones aún no genera asiento contable desde esta pantalla.
      </p>
      <PrestacionesClient personas={personas as any} historial={historial as any} />
    </div>
  )
}

async function Planillas() {
  const { drivers, bankAccounts } = await datosPlanillas()
  const segSocialDrivers = drivers.map(d => ({
    id:        d.id,
    full_name: d.full_name,
    document:  d.document ?? '',
    salary:    Number(d.salary ?? 0),
  }))
  return (
    <div className="space-y-4 -mx-4 md:-mx-6">
      <p className="text-sm text-[#64748B] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mx-4 md:mx-6 max-w-3xl">
        Registro informativo de las planillas de nómina y seguridad social anteriores. <span className="font-medium">No crea
        movimientos de banco ni asientos</span>: la nómina se causa en «Causar nómina» y los pagos se confirman desde el extracto.
      </p>
      <NominaClient drivers={drivers as any} />
      <div className="px-4 md:px-6 pb-6">
        <PlanillaSegSocialClient drivers={segSocialDrivers} bankAccounts={bankAccounts as any} />
      </div>
    </div>
  )
}
