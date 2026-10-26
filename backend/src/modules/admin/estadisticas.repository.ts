import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';

// Zona horaria de la universidad (RNF-20). Los datos se guardan en UTC; para
// agrupar por mes hay que convertir primero, o lo de la noche del día 31 cae
// en el mes siguiente.
const ZONA = 'America/Bogota';

export interface Periodo {
  desde: Date;
  hasta: Date; // exclusivo
}

export interface PorMes {
  mes: string; // 'AAAA-MM' en hora de Colombia
  perdidos: number;
  encontrados: number;
}

export interface Recuperacion {
  encontrados: number;
  entregados: number;
  tasa: number | null; // entregados / encontrados (0..1); null si no hubo encontrados
}

export interface Conteo {
  id: number;
  nombre: string;
  total: number;
}

// Consultas de solo lectura para el panel del administrador (RF-30). En SQL a mano
// porque son agregaciones (GROUP BY, FILTER, zonas horarias) que Prisma no expresa
// bien. Cuentan todas las publicaciones creadas en el periodo, ocultas incluidas:
// el moderador también necesita ver el volumen real.
@Injectable()
export class EstadisticasRepository {
  constructor(private readonly prisma: PrismaService) {}

  porMes({ desde, hasta }: Periodo): Promise<PorMes[]> {
    // FILTER (WHERE …) cuenta solo las filas que cumplen, dentro del mismo GROUP BY:
    // es como un COUNTIFS de Excel o un CALCULATE de Power BI.
    return this.prisma.$queryRaw<PorMes[]>`
      SELECT to_char(date_trunc('month', fecha_creacion AT TIME ZONE ${ZONA}), 'YYYY-MM') AS mes,
             count(*) FILTER (WHERE tipo = 'PERDIDO')::int    AS perdidos,
             count(*) FILTER (WHERE tipo = 'ENCONTRADO')::int AS encontrados
      FROM publicacion
      WHERE fecha_creacion >= ${desde} AND fecha_creacion < ${hasta}
      GROUP BY 1
      ORDER BY 1`;
  }

  // Tasa de recuperación: de los ENCONTRADOS publicados en el periodo, cuántos se entregaron.
  async recuperacion({ desde, hasta }: Periodo): Promise<Recuperacion> {
    const [fila] = await this.prisma.$queryRaw<{ encontrados: number; entregados: number }[]>`
      SELECT count(*)::int                                     AS encontrados,
             count(*) FILTER (WHERE estado = 'ENTREGADA')::int AS entregados
      FROM publicacion
      WHERE tipo = 'ENCONTRADO' AND fecha_creacion >= ${desde} AND fecha_creacion < ${hasta}`;
    return {
      ...fila,
      tasa: fila.encontrados === 0 ? null : fila.entregados / fila.encontrados,
    };
  }

  categoriasFrecuentes({ desde, hasta }: Periodo, limite = 5): Promise<Conteo[]> {
    return this.prisma.$queryRaw<Conteo[]>`
      SELECT c.id, c.nombre, count(*)::int AS total
      FROM publicacion p JOIN categoria c ON c.id = p.id_categoria
      WHERE p.fecha_creacion >= ${desde} AND p.fecha_creacion < ${hasta}
      GROUP BY c.id, c.nombre
      ORDER BY total DESC, c.nombre
      LIMIT ${limite}`;
  }

  // "Lugares críticos": donde más se pierden cosas (solo PERDIDOS), para avisar a la facultad.
  lugaresCriticos({ desde, hasta }: Periodo, limite = 5): Promise<Conteo[]> {
    return this.prisma.$queryRaw<Conteo[]>`
      SELECT l.id, s.nombre || ' · ' || l.edificio AS nombre, count(*)::int AS total
      FROM publicacion p
      JOIN lugar l ON l.id = p.id_lugar
      JOIN sede s ON s.id = l.id_sede
      WHERE p.tipo = 'PERDIDO' AND p.fecha_creacion >= ${desde} AND p.fecha_creacion < ${hasta}
      GROUP BY l.id, s.nombre, l.edificio
      ORDER BY total DESC, nombre
      LIMIT ${limite}`;
  }
}
