import { redirect } from 'next/navigation'

// El import de la DIAN se unificó: un solo archivo (recibidas + emitidas) se sube en
// /contabilidad/conciliacion-costos. Esta ruta se conserva solo como redirección para
// no romper enlaces guardados.
export default function ImportarRedirect() {
  redirect('/contabilidad/conciliacion-costos')
}
