import { supabase } from '@/lib/supabase'
import NominaClient from './NominaClient'

export const dynamic = 'force-dynamic'

// Pantalla de CAPTURA MANUAL. No calcula nómina: solo registra los montos que el
// contador entrega. Conductores = los activos con tercero_id. Fondos de pensión =
// los que existen como tercero (por NIT conocido), porque el fondo varía por
// conductor y no está en el perfil del driver.
async function getData() {
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

  return { conductores, fondos }
}

export default async function NominaMensualPage() {
  const { conductores, fondos } = await getData()
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nómina mensual</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Registra la nómina contable de un conductor (DB gastos 5205x / CR por pagar
          250505·2510·2520·2525·2370·2380). 20 líneas: devengo + aportes patronales.
        </p>
        <p className="text-xs text-[#475569] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
          Los valores se <strong>derivan del salario registrado en Conductores</strong> con las fórmulas legales
          verificadas (mar–jun): cesantías/prima 8.33%, vacaciones 4.17%, intereses 12%, ARL 4.35%, caja 4%;
          EPS/pensión sobre el IBC. Ajusta <strong>&ldquo;Días trabajados&rdquo;</strong> para meses parciales o
          usa <strong>&ldquo;Ajustar manualmente&rdquo;</strong> para excepciones reales.
        </p>
      </div>
      <NominaClient conductores={conductores} fondos={fondos} />
    </div>
  )
}
