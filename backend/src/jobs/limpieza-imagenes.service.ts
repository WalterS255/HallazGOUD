import { Injectable, Logger } from '@nestjs/common';
import { AlmacenamientoService } from '../lib/almacenamiento/almacenamiento.service.js';
import { AuditoriaService } from '../lib/auditoria/auditoria.service.js';
import { PrismaService } from '../lib/prisma/prisma.service.js';

// §6.5 (retención, sección 12 de la propuesta): 90 días después de una entrega, las fotos
// del objeto se borran. Ya cumplieron su función y son datos que no hace falta guardar.
export const DIAS_RETENCION_IMAGENES = 90;
const PREFIJO_URL = '/api/imagenes/'; // las URL guardadas apuntan al backend (imagenes.service.ts)

export interface ResultadoLimpieza {
  publicaciones: number; // publicaciones a las que se les borraron fotos
  imagenes: number; // filas de `imagen` borradas (cada una = grande + miniatura en S3)
}

// Tarea diaria (la dispara ProgramadorService). Orden, por publicación:
//   1) En UNA transacción: borrar las filas de `imagen` y registrarlo en la auditoría.
//   2) DESPUÉS, borrar los archivos de S3 (grande y miniatura).
// La base es la fuente de verdad: si fallara al revés (S3 primero y la base después),
// quedarían filas apuntando a fotos que ya no existen. Así, en el peor caso, queda un
// archivo huérfano en el bucket, que nadie ve ni se sirve.
@Injectable()
export class LimpiezaImagenesService {
  private readonly logger = new Logger(LimpiezaImagenesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async limpiarEntregadas(): Promise<ResultadoLimpieza> {
    // now() de la BD: el límite y fecha_entrega salen del mismo reloj (regla de fechas).
    const vencidas = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT DISTINCT p.id
      FROM publicacion p
      JOIN reclamacion r ON r.id_publicacion = p.id AND r.estado = 'ACEPTADA'
      JOIN entrega e ON e.id_reclamacion = r.id
      WHERE p.estado = 'ENTREGADA'
        AND e.fecha_entrega < now() - make_interval(days => ${DIAS_RETENCION_IMAGENES})
        AND EXISTS (SELECT 1 FROM imagen i WHERE i.id_publicacion = p.id)
      ORDER BY p.id
      LIMIT 500`;

    const resultado: ResultadoLimpieza = { publicaciones: 0, imagenes: 0 };
    for (const { id } of vencidas) {
      const borradas = await this.prisma.$transaction(async (tx) => {
        const filas = await tx.imagen.findMany({
          where: { id_publicacion: id },
          select: { url: true, url_miniatura: true },
        });
        await tx.imagen.deleteMany({ where: { id_publicacion: id } });
        await this.auditoria.registrar(
          {
            accion: 'IMAGENES_RETENCION',
            entidad: 'publicacion',
            id_entidad: id,
            id_usuario: null, // la hizo el sistema (cron)
            detalle: { imagenes: filas.length, dias: DIAS_RETENCION_IMAGENES },
          },
          tx,
        );
        return filas;
      });
      // Fuera de la transacción: S3 no participa de ella.
      for (const f of borradas) {
        for (const url of [f.url, f.url_miniatura]) {
          await this.almacenamiento.borrarSinRomper(url.slice(PREFIJO_URL.length));
        }
      }
      resultado.publicaciones++;
      resultado.imagenes += borradas.length;
    }
    this.logger.log(resultado, 'Limpieza de imágenes');
    return resultado;
  }
}
