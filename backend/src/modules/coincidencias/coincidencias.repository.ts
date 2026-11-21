import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import { VENTANA_DIAS, type DatosCoincidencia } from './puntaje.js';

export interface Publicacion extends DatosCoincidencia {
  id: number;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  id_usuario: number;
}

// Solo lee de la BD; las reglas (el puntaje) viven en el servicio y en puntaje.ts.
// Devuelve únicamente ids y los campos del puntaje: nunca datos de contacto (§6.3).
@Injectable()
export class CoincidenciasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscarReferencia(id: number): Promise<Publicacion | null> {
    // SQL a mano porque Prisma no sabe leer columnas tsvector (Unsupported):
    // tsvector_to_array convierte los lexemas en un arreglo de texto.
    const filas = await this.prisma.$queryRaw<Publicacion[]>`
      SELECT p.id, p.tipo::text AS tipo, p.id_usuario, p.id_categoria, l.id_sede, l.tipo::text AS tipo_lugar,
             p.fecha_suceso, tsvector_to_array(p.busqueda) AS palabras
      FROM publicacion p
      JOIN lugar l ON l.id = p.id_lugar
      WHERE p.id = ${id}`;
    return filas[0] ?? null;
  }

  // PREFILTRO (§7): descarta casi toda la tabla con condiciones que usan el índice
  // idx_publicacion_coincidencias. El puntaje se calcula después, solo sobre estos.
  async buscarCandidatos(ref: Publicacion): Promise<Publicacion[]> {
    return this.prisma.$queryRaw<Publicacion[]>`
      SELECT c.id, c.tipo::text AS tipo, c.id_usuario, c.id_categoria, l.id_sede, l.tipo::text AS tipo_lugar,
             c.fecha_suceso, tsvector_to_array(c.busqueda) AS palabras
      FROM publicacion c
      JOIN lugar l ON l.id = c.id_lugar
      WHERE c.tipo <> ${ref.tipo}::tipo_publicacion
        AND c.estado = 'ACTIVA'
        AND NOT c.oculta
        AND c.id_usuario <> ${ref.id_usuario}
        AND c.fecha_suceso BETWEEN ${ref.fecha_suceso}::timestamptz - make_interval(days => ${VENTANA_DIAS})
                               AND ${ref.fecha_suceso}::timestamptz + make_interval(days => ${VENTANA_DIAS})`;
  }
}
