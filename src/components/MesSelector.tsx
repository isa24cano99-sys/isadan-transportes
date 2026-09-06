'use client'

// Botones de mes (más-reciente-primero) + "Todos". Cada botón LLENA desde/hasta con el rango
// del mes (1º → último día), reutilizando el filtro de rango existente — sin lógica de filtro
// nueva. El mes activo se resalta cuando desde/hasta coinciden EXACTO con sus límites.
// `meses`: lista de 'YYYY-MM' ya ordenada más-reciente-primero (derivada de los datos cargados).

const MESES_ABBR = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ultimoDia = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(y, m, 0).getDate() }
export const rangoDeMes = (p: string) => ({ desde: `${p}-01`, hasta: `${p}-${String(ultimoDia(p)).padStart(2, '0')}` })

export default function MesSelector({ meses, desde, hasta, onRango }: {
  meses: string[]
  desde: string
  hasta: string
  onRango: (desde: string, hasta: string) => void
}) {
  const multiAño = new Set(meses.map(p => p.slice(0, 4))).size > 1
  const label = (p: string) => { const [y, m] = p.split('-'); return multiAño ? `${MESES_ABBR[Number(m)]} ${y.slice(2)}` : MESES_ABBR[Number(m)] }
  const esActivo = (p: string) => { const r = rangoDeMes(p); return desde === r.desde && hasta === r.hasta }
  const todos = !desde && !hasta
  const cls = (active: boolean) =>
    `text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
      active ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
    }`

  if (meses.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mr-0.5">Mes</span>
      <button type="button" onClick={() => onRango('', '')} className={cls(todos)}>Todos</button>
      {meses.map(p => (
        <button key={p} type="button" onClick={() => { const r = rangoDeMes(p); onRango(r.desde, r.hasta) }} className={cls(esActivo(p))}>
          {label(p)}
        </button>
      ))}
    </div>
  )
}
