import Link from 'next/link'

// Selector de mes para server components (searchParams). Botones más-reciente-primero + "Todos".
// `meses`: 'YYYY-MM' ordenados más-reciente-primero. `sel`: periodo activo o 'todos'. `basePath`: ruta.
// "Todos" (sin ?periodo) = panorama completo post-corte; un mes = solo ese mes.
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// [inicio, fin) de un periodo 'YYYY-MM' (fin = 1º del mes siguiente). Para usar en las queries.
export function rangoMes(periodo: string): { inicio: string; fin: string } {
  const [y, m] = periodo.split('-').map(Number)
  const fin = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { inicio: `${periodo}-01`, fin }
}

export default function MesSelectorLinks({ meses, sel, basePath }: { meses: string[]; sel: string; basePath: string }) {
  const multiAño = new Set(meses.map(p => p.slice(0, 4))).size > 1
  const label = (p: string) => { const [y, m] = p.split('-'); return multiAño ? `${MESES[Number(m)]} ${y.slice(2)}` : MESES[Number(m)] }
  const cls = (a: boolean) =>
    `text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
      a ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
    }`
  const activoTodos = !sel || sel === 'todos'
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mr-0.5">Mes</span>
      <Link href={basePath} className={cls(activoTodos)}>Todos</Link>
      {meses.map(p => (
        <Link key={p} href={`${basePath}?periodo=${p}`} className={cls(sel === p)}>{label(p)}</Link>
      ))}
    </div>
  )
}
