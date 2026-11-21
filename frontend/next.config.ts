import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // Monorepo: la raíz también tiene un package-lock.json (husky). La app es esta carpeta.
  outputFileTracingRoot: process.cwd(),
  // Sólo desarrollo: permite abrir `npm run dev` desde un celular en la misma red (http://192.168.x.x:3001).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
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
