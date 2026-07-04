'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function crearPucCuentaAction(data: {
  nombre: string
  tipo: string
}): Promise<{ ok: boolean; error?: string; account?: unknown }> {
  // Auto-generate a unique 9-digit code for custom accounts (starts with 9)
  const codigo = `9${Date.now().toString().slice(-8)}`
  const { data: created, error } = await supabase
    .from('puc_accounts')
    .insert({ codigo, nombre: data.nombre, tipo: data.tipo, active: true })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/bancos')
  return { ok: true, account: created }
}
