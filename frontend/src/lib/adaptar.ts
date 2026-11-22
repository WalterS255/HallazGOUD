// Conversión entre formas de la API.
import type { Publicacion, ResumenPublicacion } from './tipos';

/** Ficha de detalle → fila de catálogo (para mostrar coincidencias como tarjetas). */
export function aResumen(p: Publicacion): ResumenPublicacion {
  return {
    id: p.id,
    tipo: p.tipo,
    estado: p.estado,
    titulo: p.titulo,
    fecha_suceso: p.fecha_suceso,
    fecha_creacion: p.fecha_creacion,
    categoria: p.categoria.nombre,
    sede: p.lugar.sede.nombre,
    edificio: p.lugar.edificio,
    miniatura: p.imagenes[0]?.url_miniatura ?? null,
  };
}

/** Enlace al chat. Con el id de la publicación, el chat puede mostrar el título y la contraparte. */
export function enlaceChat(idReclamacion: number, idPublicacion?: number) {
  return idPublicacion
    ? `/mensajes/${idReclamacion}?publicacion=${idPublicacion}`
    : `/mensajes/${idReclamacion}`;
}
