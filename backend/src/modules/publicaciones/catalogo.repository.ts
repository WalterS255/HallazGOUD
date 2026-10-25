import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { EstadoPublicacion } from './estados.js';

export type Orden = 'recientes' | 'antiguos' | 'relevancia';

export interface FiltrosCatalogo {
  tipo?: 'PERDIDO' | 'ENCONTRADO';
  id_categoria?: number;
  id_sede?: number;
  estado?: EstadoPublicacion;
  desde?: Date; // fecha_suceso >= desde
  hasta?: Date; // fecha_suceso <= hasta
  q?: string; // palabras clave (RF-14)
  orden: Orden;
  limite: number;
  desplazamiento: number;
}

// Lo ÚNICO que sale del catálogo público. Lista cerrada a propósito (§6.3):
// nada de usuario (ni siquiera el nombre), ni detalle reservado, ni descripción completa.
export interface ItemCatalogo {
  id: number;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  estado: EstadoPublicacion;
  titulo: string;
  fecha_suceso: Date;
  fecha_creacion: Date;
  categoria: string;
  sede: string;
  edificio: string;
  miniatura: string | null;
}

// Ficha de detalle (RF-17). `select` explícito: Prisma trae SOLO lo nombrado aquí,
// así una columna nueva en la tabla nunca se filtra sola a la API (§6.3).
// Del autor, solo { id, nombre }: el id sirve para que el frontend sepa si quien mira
// es el autor; el correo y el teléfono nunca salen (RF-22).
const SELECT_DETALLE = {
  id: true,
  tipo: true,
  estado: true,
  titulo: true,
  descripcion: true,
  fecha_suceso: true,
  fecha_creacion: true,
  categoria: { select: { id: true, nombre: true, sensible: true } },
  lugar: {
    select: { edificio: true, referencia: true, sede: { select: { id: true, nombre: true } } },
  },
  imagenes: { select: { url: true, url_miniatura: true, orden: true }, orderBy: { orden: 'asc' } },
  usuario: { select: { id: true, nombre: true } },
} satisfies Prisma.publicacionSelect;

export type DetallePublicacion = Prisma.publicacionGetPayload<{ select: typeof SELECT_DETALLE }>;

@Injectable()
export class CatalogoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Las ocultas por moderación responden igual que si no existieran.
  detalle(id: number): Promise<DetallePublicacion | null> {
    return this.prisma.publicacion.findFirst({
      where: { id, oculta: false },
      select: SELECT_DETALLE,
    });
  }

  // Una sola consulta SQL con el WHERE armado según los filtros que lleguen.
  // Prisma.sql pone cada valor como PARÁMETRO ($1, $2…), nunca pegado al texto:
  // por eso un q como "'; DROP TABLE usuario; --" es solo una búsqueda rara.
  async buscar(f: FiltrosCatalogo): Promise<{ items: ItemCatalogo[]; total: number }> {
    const consulta = f.q ? Prisma.sql`plainto_tsquery('spanish', ${f.q})` : null;

    const condiciones: Prisma.Sql[] = [
      Prisma.sql`NOT p.oculta`, // lo ocultado por moderación nunca sale (RF-27)
      Prisma.sql`p.estado = ${f.estado ?? 'ACTIVA'}::estado_publicacion`,
    ];
    if (f.tipo) condiciones.push(Prisma.sql`p.tipo = ${f.tipo}::tipo_publicacion`);
    if (f.id_categoria) condiciones.push(Prisma.sql`p.id_categoria = ${f.id_categoria}`);
    if (f.id_sede) condiciones.push(Prisma.sql`l.id_sede = ${f.id_sede}`);
    if (f.desde) condiciones.push(Prisma.sql`p.fecha_suceso >= ${f.desde}`);
    if (f.hasta) condiciones.push(Prisma.sql`p.fecha_suceso <= ${f.hasta}`);
    if (consulta) condiciones.push(Prisma.sql`p.busqueda @@ ${consulta}`);
    const where = Prisma.join(condiciones, ' AND ');

    // "relevancia" solo tiene sentido si hay palabras que buscar; si no, recientes.
    // p.id al final: desempate estable, para que la página 2 no repita filas de la 1.
    const orden =
      f.orden === 'relevancia' && consulta
        ? Prisma.sql`ts_rank(p.busqueda, ${consulta}) DESC, p.fecha_creacion DESC, p.id DESC`
        : f.orden === 'antiguos'
          ? Prisma.sql`p.fecha_creacion ASC, p.id ASC`
          : Prisma.sql`p.fecha_creacion DESC, p.id DESC`;

    const desde = Prisma.sql`
      FROM publicacion p
      JOIN categoria c ON c.id = p.id_categoria
      JOIN lugar l ON l.id = p.id_lugar
      JOIN sede s ON s.id = l.id_sede
      WHERE ${where}`;

    const [items, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<ItemCatalogo[]>`
        SELECT p.id, p.tipo::text AS tipo, p.estado::text AS estado, p.titulo,
               p.fecha_suceso, p.fecha_creacion,
               c.nombre AS categoria, s.nombre AS sede, l.edificio,
               (SELECT i.url_miniatura FROM imagen i
                WHERE i.id_publicacion = p.id ORDER BY i.orden LIMIT 1) AS miniatura
        ${desde}
        ORDER BY ${orden}
        LIMIT ${f.limite} OFFSET ${f.desplazamiento}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${desde}`,
    ]);
    return { items, total };
  }
}
