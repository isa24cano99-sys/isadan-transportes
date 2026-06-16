'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function marcarCuotaPagadaAction(
  installmentId: string,
  loanId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('loan_installments')
    .update({ status: 'PAGADA' })
    .eq('id', installmentId)

  if (error) {
    console.error(JSON.stringify(error))
    return { ok: false, error: 'Error al actualizar la cuota' }
  }

  revalidatePath(`/prestamos/${loanId}`)
  revalidatePath('/prestamos')
  return { ok: true }
}
