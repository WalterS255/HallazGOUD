import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  // Rutas a las que enlazan los correos de aviso del backend (`ruta` en notificaciones.service.ts).
  async redirects() {
    return [
      { source: '/reclamaciones/:id', destination: '/mensajes/:id', permanent: false },
      { source: '/publicaciones/:id/reclamaciones', destination: '/publicaciones/:id#reclamaciones', permanent: false },
    ];
  },
};

export default config;
