import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { CoincidenciasRepository, type Publicacion } from './coincidencias.repository.js';
import { calcularPuntaje, type Desglose, seMuestra } from './puntaje.js';

export interface Sugerencia {
  id_publicacion: number;
  puntaje: Desglose;
}

@Injectable()
export class CoincidenciasService {
  constructor(private readonly repo: CoincidenciasRepository) {}

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
