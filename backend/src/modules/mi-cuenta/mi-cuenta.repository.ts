import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { EstadoPublicacion } from '../publicaciones/estados.js';

// Lo que ve una persona sobre SUS cosas. Igual que en el catálogo, cada consulta nombra
// sus columnas una por una (§6.3): de otras personas solo sale { id, nombre }, nunca el
// correo, y el detalle reservado no se lee aquí en ningún caso.

export interface MiPublicacionFila {
  id: number;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  estado: EstadoPublicacion;
  titulo: string;
  fecha_suceso: Date;
  fecha_creacion: Date;
  categoria: string;
  sede: string;
  edificio: string;
  ubicacion: string | null;
  miniatura: string | null;
  oculta: boolean;
  reclamaciones_pendientes: number;
}

export interface MiReclamacionFila {
  id: number;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';
  fecha: Date;
  publicacion: {
    id: number;
    titulo: string;
    estado: EstadoPublicacion;
    usuario: { id: number; nombre: string | null };
  };
}

export interface ConversacionFila {
  id_reclamacion: number;
  id_publicacion: number;
  titulo: string;
  estado_publicacion: EstadoPublicacion;
  autor_id: number;
  autor_nombre: string | null;
  reclamante_id: number;
  reclamante_nombre: string | null;
  ultimo_contenido: string | null;
  ultima_fecha: Date | null;
  fecha_aceptacion: Date | null;
  no_leidos: number;
}

@Injectable()
export class MiCuentaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // TODAS las del autor, en cualquier estado y aunque estén ocultas: son suyas.
  // Misma forma que una fila del catálogo + reclamaciones por revisar.
  publicaciones(idUsuario: number): Promise<MiPublicacionFila[]> {
    return this.prisma.$queryRaw<MiPublicacionFila[]>`
      SELECT p.id, p.tipo::text AS tipo, p.estado::text AS estado, p.titulo,
             p.fecha_suceso, p.fecha_creacion,
             c.nombre AS categoria, s.nombre AS sede, l.edificio, p.ubicacion,
             (SELECT i.url_miniatura FROM imagen i
              WHERE i.id_publicacion = p.id ORDER BY i.orden LIMIT 1) AS miniatura,
             p.oculta,
             (SELECT count(*)::int FROM reclamacion r
              WHERE r.id_publicacion = p.id AND r.estado = 'PENDIENTE') AS reclamaciones_pendientes
      FROM publicacion p
      JOIN categoria c ON c.id = p.id_categoria
      JOIN lugar l ON l.id = p.id_lugar
      JOIN sede s ON s.id = l.id_sede
      WHERE p.id_usuario = ${idUsuario}
      ORDER BY p.fecha_creacion DESC, p.id DESC`;
  }

  // Las que YO hice. No se devuelve respuesta_detalle: es mía, pero no hace falta en la lista.
  reclamaciones(idUsuario: number): Promise<MiReclamacionFila[]> {
    return this.prisma.reclamacion.findMany({
      where: { id_reclamante: idUsuario },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        estado: true,
        fecha: true,
        publicacion: {
          select: {
            id: true,
            titulo: true,
            estado: true,
            usuario: { select: { id: true, nombre: true } },
          },
        },
      },
    });
  }

  // Una fila por reclamación ACEPTADA donde soy autor o reclamante (§6.4: el chat solo
  // existe en ese caso). LEFT JOIN LATERAL trae el último mensaje de cada hilo usando
  // el índice (id_reclamacion, fecha_envio). no_leidos: lo que la OTRA parte escribió
  // y yo no he abierto.
  conversaciones(idUsuario: number): Promise<ConversacionFila[]> {
    return this.prisma.$queryRaw<ConversacionFila[]>`
      SELECT r.id AS id_reclamacion,
             p.id AS id_publicacion, p.titulo, p.estado::text AS estado_publicacion,
             a.id AS autor_id, a.nombre AS autor_nombre,
             rc.id AS reclamante_id, rc.nombre AS reclamante_nombre,
             um.contenido AS ultimo_contenido, um.fecha_envio AS ultima_fecha,
             r.fecha_resolucion AS fecha_aceptacion,
             (SELECT count(*)::int FROM mensaje m
              WHERE m.id_reclamacion = r.id AND m.id_emisor <> ${idUsuario} AND NOT m.leido) AS no_leidos
      FROM reclamacion r
      JOIN publicacion p ON p.id = r.id_publicacion
      JOIN usuario a ON a.id = p.id_usuario
      JOIN usuario rc ON rc.id = r.id_reclamante
      LEFT JOIN LATERAL (
        SELECT m.contenido, m.fecha_envio FROM mensaje m
        WHERE m.id_reclamacion = r.id
        ORDER BY m.fecha_envio DESC, m.id DESC LIMIT 1
      ) um ON true
      WHERE r.estado = 'ACEPTADA'
        AND (p.id_usuario = ${idUsuario} OR r.id_reclamante = ${idUsuario})
      ORDER BY COALESCE(um.fecha_envio, r.fecha_resolucion, r.fecha) DESC, r.id DESC`;
  }
}
