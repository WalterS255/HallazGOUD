import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { CoincidenciasRepository } from './coincidencias.repository.js';
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
    const candidatos = await this.repo.buscarCandidatos(ref);
    return candidatos
      .map((c) => ({ id_publicacion: c.id, puntaje: calcularPuntaje(ref, c) }))
      .filter((s) => seMuestra(s.puntaje))
      .sort((a, b) => b.puntaje.total - a.puntaje.total);
  }
}
