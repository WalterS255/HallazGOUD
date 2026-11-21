import type { ReclamacionDetalle } from './tipos';

// Aquí y no en components/Chat.tsx: ese archivo es 'use client', y una página del
// servidor no puede llamar funciones de un archivo de cliente (Next las convierte en
// referencias para el navegador).

export type EstadoEntrega = 'pendiente' | 'yo-confirme' | 'otro-confirmo' | 'entregada';

// En qué va la entrega vista desde MI lado, a partir de GET /reclamaciones/:id.
// Así, al recargar la página, el botón "Confirmar" no vuelve a salir si ya confirmé.
export function estadoEntrega(f: Pick<ReclamacionDetalle, 'soy' | 'entrega'>): EstadoEntrega {
  const e = f.entrega;
  if (!e) return 'pendiente';
  if (e.fecha_entrega) return 'entregada';
  const [mia, suya] = f.soy === 'AUTOR' ? [e.confirmo_autor, e.confirmo_reclamante] : [e.confirmo_reclamante, e.confirmo_autor];
  if (mia) return 'yo-confirme';
  return suya ? 'otro-confirmo' : 'pendiente';
}
