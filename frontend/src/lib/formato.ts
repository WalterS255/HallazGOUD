// Utilidades de presentación (RNF-20: español y hora de Colombia, UTC−5).
import type { EstadoPublicacion, EstadoReclamacion, Notificacion, TipoPublicacion } from './tipos';

const ZONA = 'America/Bogota';

export function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: ZONA }).format(new Date(fecha));
}

export function formatearFechaHora(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(
    new Date(fecha),
  );
}

export function relativo(fecha: string) {
  const horas = (Date.now() - new Date(fecha).getTime()) / 3_600_000;
  if (horas < 1) return 'hace unos minutos';
  if (horas < 24) return `hace ${Math.round(horas)} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

/** Fecha y hora de Colombia → ISO con zona, como pide el backend en fecha_suceso. */
export function aFechaSuceso(fecha: string, hora: string) {
  return `${fecha}T${hora}:00-05:00`;
}

/** Lo contrario de aFechaSuceso: un ISO (UTC) → fecha AAAA-MM-DD y hora HH:MM de Colombia. */
export function aFechaYHoraColombia(iso: string): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` };
}

/** Hoy en Colombia como AAAA-MM-DD (atributo max de los input date). */
export function hoyColombia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}

export function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0];
}

/** Número de folio, como en una etiqueta de objetos perdidos. */
export function folio(id: number) {
  return `HG-${String(id).padStart(4, '0')}`;
}

/** El backend guarda el ícono como un nombre (p. ej. "id-card"); aquí se muestra como emoji.
 *  También es la lista de íconos que ofrece el admin al crear una categoría. */
export const ICONOS_CATEGORIA: Record<string, string> = {
  laptop: '💻',
  'id-card': '🪪',
  'credit-card': '💳',
  key: '🔑',
  shirt: '👕',
  book: '📚',
  cup: '🥤',
  box: '📦',
};
export function iconoCategoria(icono: string | null | undefined) {
  return (icono && ICONOS_CATEGORIA[icono]) || '📦';
}

/** Nombre de categoría → emoji. El catálogo de publicaciones trae la categoría sólo por nombre. */
export function mapaIconos(categorias: { nombre: string; icono: string | null }[]) {
  return Object.fromEntries(categorias.map((c) => [c.nombre, iconoCategoria(c.icono)]));
}

export const ETIQUETA_TIPO: Record<TipoPublicacion, string> = { PERDIDO: 'Perdido', ENCONTRADO: 'Encontrado' };

export const ETIQUETA_ESTADO: Record<EstadoPublicacion, string> = {
  ACTIVA: 'Activa',
  EN_RECLAMACION: 'En reclamación',
  ENTREGADA: 'Entregada',
  EXPIRADA: 'Expirada',
  RETIRADA: 'Retirada',
};

export const ETIQUETA_RECLAMACION: Record<EstadoReclamacion, string> = {
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};

/** A dónde lleva cada aviso según su tipo (tabla de api.md §11). */
export function enlaceNotificacion(n: Notificacion): string {
  const ref = n.id_referencia;
  switch (n.tipo) {
    case 'RECLAMACION':
    case 'COINCIDENCIA':
    case 'MODERACION':
      return ref ? `/publicaciones/${ref}` : '/mis-publicaciones';
    case 'MENSAJE':
      return ref ? `/mensajes/${ref}` : '/mensajes';
    case 'ESTADO':
      return ref ? `/mensajes/${ref}` : '/perfil';
    default:
      return '/notificaciones';
  }
}
