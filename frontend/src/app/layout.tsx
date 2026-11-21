import type { Metadata, Viewport } from 'next';
import { Archivo, Atkinson_Hyperlegible, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { Encabezado } from '@/components/Encabezado';
import './globals.css';

// Display con carácter (Archivo ancho), cuerpo muy legible (Atkinson, diseñada para baja visión, RNF-05)
// y monoespaciada para folios y cifras.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'HallazGO UD', template: '%s · HallazGO UD' },
  description:
    'Lo que se pierde en la U, en la U aparece. Objetos perdidos y encontrados de la Universidad Distrital.',
};

export const viewport: Viewport = { themeColor: '#151110' };

// Aplica el tema guardado antes de pintar, para que no parpadee. Sin preferencia: oscuro.
const SCRIPT_TEMA = `try{var t=localStorage.getItem('tema');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${archivo.variable} ${atkinson.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Script id="tema" strategy="beforeInteractive">
          {SCRIPT_TEMA}
        </Script>
        <a href="#contenido" className="saltar">
          Saltar al contenido
        </a>
        <Encabezado />
        <main id="contenido" className="wrap grid w-full flex-1 content-start gap-10 py-7 pb-14">
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div className="wrap small muted flex flex-wrap justify-between gap-2 py-5">
            <span>HallazGO UD · Universidad Distrital Francisco José de Caldas</span>
            <span className="flex gap-4">
              <a href="/estado" className="link">
                Estado de la conexión
              </a>
              <a href="/privacidad" className="link">
                Tratamiento de datos
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
