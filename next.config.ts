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
    ]
  },
};

export default nextConfig;
