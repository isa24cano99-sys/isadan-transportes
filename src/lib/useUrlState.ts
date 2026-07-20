'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Estado de filtro persistido en la URL (query param), drop-in de useState<string>.
 * Usa window.history.replaceState → sincroniza con useSearchParams SIN recargar la
 * página ni re-ejecutar el server component (no hay re-fetch de datos).
 *
 * Leer window.location.search fresco en cada set permite limpiar/cambiar varios
 * filtros en el mismo tick sin pisarse.
 */
export function useUrlState(
  key: string,
  defaultValue = '',
): [string, (v: string) => void] {
  const searchParams = useSearchParams()
  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback((v: string) => {
    const params = new URLSearchParams(window.location.search)
    if (!v || v === defaultValue) params.delete(key)
    else params.set(key, v)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [key, defaultValue])

  return [value, setValue]
}

/** Devuelve una función que limpia TODOS los query params (sin recargar). */
export function useClearUrlFilters(): () => void {
  return useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
}
