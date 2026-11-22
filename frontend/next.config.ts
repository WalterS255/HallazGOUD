import type { NextConfig } from 'next';

const desarrollo = process.env.NODE_ENV !== 'production';

// Content-Security-Policy: de dónde puede cargar cosas la página. Si alguien lograra
// meter código, el navegador no lo dejaría cargar scripts de otro sitio, enviar datos a
// otro dominio, enmarcar la app ni cambiar a dónde van los formularios.
// Concesión conocida: 'unsafe-inline' en scripts, porque Next inyecta scripts en línea
// para hidratar la página. Quitarlo exige nonces por petición (mejora futura); mientras
// tanto la defensa principal contra XSS sigue siendo React (escapa todo) y no usar
// dangerouslySetInnerHTML (RNF-08). En desarrollo, React necesita eval y Next usa un
// websocket para recargar al guardar.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // blob: = vista previa de las fotos antes de subirlas
  "font-src 'self'",
  `connect-src 'self'${desarrollo ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const config: NextConfig = {
  poweredByHeader: false,
  // Producción en Docker (Fase K): `next build` genera .next/standalone, un servidor
  // mínimo con solo los archivos que la app usa. No cambia nada en `npm run dev`.
  output: 'standalone',
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
          // Encontrados con OWASP ZAP (Fase J):
          { key: 'Content-Security-Policy', value: csp },
          // La app no usa cámara (las fotos se eligen con <input type=file>), micrófono, GPS ni pagos.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Aísla la ventana y los recursos de otros sitios (ventanas emergentes, lecturas cruzadas).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  // Rutas a las que enlazan los correos de aviso del backend (`ruta` en notificaciones.service.ts).
  async redirects() {
    return [
      { source: '/reclamaciones/:id', destination: '/mensajes/:id', permanent: false },
      {
        source: '/publicaciones/:id/reclamaciones',
        destination: '/publicaciones/:id#reclamaciones',
        permanent: false,
      },
    ];
  },
};

export default config;
