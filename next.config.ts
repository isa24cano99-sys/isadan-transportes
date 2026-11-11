import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Pantallas retiradas: los marcadores viejos llevan a la pantalla que las reemplazó.
  async redirects() {
    return [
      { source: '/clientes',        destination: '/terceros', permanent: false },
      { source: '/proveedores',     destination: '/terceros', permanent: false },
      { source: '/bancos/importar', destination: '/bancos',   permanent: false },
      { source: '/facturas',         destination: '/contabilidad/facturacion', permanent: false },
      { source: '/facturas/clientes', destination: '/contabilidad/facturacion', permanent: false },
      { source: '/prestaciones',     destination: '/nomina?tab=prestaciones', permanent: false },
      { source: '/contabilidad/nomina-mensual',   destination: '/nomina?tab=causar', permanent: false },
      { source: '/contabilidad/seguridad-social', destination: '/nomina?tab=pila',   permanent: false },
    ]
  },
};

export default nextConfig;
