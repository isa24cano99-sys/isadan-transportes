// Módulo CLIENT-SAFE: tipo + constante compartidos entre el formulario (cliente) y el
// helper de datos (server). NO importa `supabase` — si lo hiciera, un componente 'use client'
// que importe FE_LINEA_CUENTA como valor arrastraría la service key al bundle del navegador
// y la página no cargaría. Mantener este archivo sin dependencias server-only.

export type FEClasificada = { id: string; issue_date: string; total: number; name_issuer: string; cuenta: string }

// clave de línea de gasto fijo → cuenta de clasificación del tercero que la alimenta
export const FE_LINEA_CUENTA: Record<string, string> = {
  acpm_contado: '61450510',
  cargue:       '61450515',
  descargue:    '61450535',
}
