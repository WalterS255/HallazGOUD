import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { CoincidenciasRepository, type Publicacion } from './coincidencias.repository.js';
import { calcularPuntaje, type Desglose, seMuestra } from './puntaje.js';

export interface Sugerencia {
  id_publicacion: number;
  puntaje: Desglose;
}

@Injectable()
export class CoincidenciasService {
  private readonly logger = new Logger(CoincidenciasService.name);

  constructor(
    private readonly repo: CoincidenciasRepository,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Lo que llama GestionService.crear() DESPUÉS de guardar un ENCONTRADO. NUNCA lanza:
  // si buscar compatibles o avisar falla, la publicación ya creada no debe responder 500.
  async alPublicarEncontrado(idEncontrado: number): Promise<void> {
    try {
      await this.avisarCompatibles(idEncontrado);
    } catch (error) {
      this.logger.error(error, `No se pudo avisar coincidencias de la publicación ${idEncontrado}`);
    }
  }

  // RF-24: al publicar un ENCONTRADO, avisar a los autores de los PERDIDOS compatibles.
  // Se llama DESPUÉS de guardar la publicación (fuera de su transacción). Devuelve a
  // cuántas personas se avisó. Con un PERDIDO no hace nada: ese autor ve sus
  // sugerencias en GET /publicaciones/:id/coincidencias (RF-23).
  async avisarCompatibles(idEncontrado: number): Promise<number> {
    const ref = await this.repo.buscarReferencia(idEncontrado);
    if (!ref || ref.tipo !== 'ENCONTRADO') return 0;
    const candidatos = await this.repo.buscarCandidatos(ref);
    // Un mismo autor con varios PERDIDOS compatibles recibe UN aviso, no varios.
    const autores = new Set(
      candidatos.filter((c) => seMuestra(calcularPuntaje(ref, c))).map((c) => c.id_usuario),
    );
    await this.notificaciones.avisarATodos(
      [...autores].map((id_usuario) => ({
        id_usuario,
        tipo: 'COINCIDENCIA' as const,
        mensaje: 'Apareció un objeto encontrado que podría ser el que perdiste. Revísalo.',
        id_referencia: idEncontrado,
        ruta: `/publicaciones/${idEncontrado}`,
      })),
    );
    return autores.size;
  }

  // Sirve en los dos sentidos (§7): para un PERDIDO devuelve ENCONTRADOS
  // (sugerencias, RF-23) y para un ENCONTRADO devuelve PERDIDOS (a quién notificar, RF-24).
  async sugerencias(idPublicacion: number): Promise<Sugerencia[]> {
    const ref = await this.repo.buscarReferencia(idPublicacion);
    if (!ref) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'PUBLICACION_NO_ENCONTRADA',
        'La publicación no existe.',
      );
    }
    return this.puntuar(ref, await this.repo.buscarCandidatos(ref));
  }

  // GET /publicaciones/:id/coincidencias (§8): SOLO el autor de la publicación.
  // `sugerencias` (sin solicitante) queda para uso interno, como avisar a los autores
  // de PERDIDOS compatibles cuando se crea un ENCONTRADO (RF-24).
  async sugerenciasParaAutor(idPublicacion: number, idSolicitante: number): Promise<Sugerencia[]> {
    const ref = await this.repo.buscarReferencia(idPublicacion);
    if (!ref || ref.id_usuario !== idSolicitante) {
      // Mismo error si no existe o si no es el autor: no se revela qué publicaciones existen.
      throw new ErrorApp(
        HttpStatus.FORBIDDEN,
        'PROHIBIDO',
        'Solo el autor puede ver las coincidencias de su publicación.',
      );
    }
    return this.puntuar(ref, await this.repo.buscarCandidatos(ref));
  }

  private puntuar(ref: Publicacion, candidatos: Publicacion[]): Sugerencia[] {
    return candidatos
      .map((c) => ({ id_publicacion: c.id, puntaje: calcularPuntaje(ref, c) }))
      .filter((s) => seMuestra(s.puntaje))
      .sort((a, b) => b.puntaje.total - a.puntaje.total);
  }
}
