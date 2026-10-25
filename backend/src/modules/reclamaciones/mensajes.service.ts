import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { type Hilo, MensajesRepository } from './mensajes.repository.js';

export const LARGO_MAXIMO = 2000; // igual que chk_mensaje_contenido

// Chat 1 a 1 de una reclamación aceptada (§6.4, RF-20).
@Injectable()
export class MensajesService {
  constructor(private readonly repo: MensajesRepository) {}

  async listar(id_reclamacion: number, id_usuario: number) {
    this.exigirParte(await this.repo.hilo(id_reclamacion), id_usuario);
    return this.repo.listarYMarcarLeidos(id_reclamacion, id_usuario);
  }

  async enviar(id_reclamacion: number, id_emisor: number, contenido: string) {
    const hilo = this.exigirParte(await this.repo.hilo(id_reclamacion), id_emisor);
    if (hilo.entregada) {
      throw new ErrorApp(
        HttpStatus.CONFLICT,
        'CHAT_CERRADO',
        'La entrega ya se confirmó: el chat es de solo lectura.',
      );
    }
    const texto = contenido.trim();
    if (texto.length === 0 || texto.length > LARGO_MAXIMO) {
      throw new ErrorApp(
        HttpStatus.BAD_REQUEST,
        'MENSAJE_INVALIDO',
        `El mensaje debe tener entre 1 y ${LARGO_MAXIMO} caracteres.`,
      );
    }
    return this.repo.crear({
      id_reclamacion,
      id_emisor,
      contenido: texto,
      id_publicacion: hilo.id_publicacion,
    });
  }

  private exigirParte(hilo: Hilo | null, id_usuario: number): Hilo {
    const esParte = hilo && (id_usuario === hilo.id_reclamante || id_usuario === hilo.id_autor);
    // Mismo error si no existe o si no es parte: no se revela qué reclamaciones existen.
    if (!hilo || !esParte) {
      throw new ErrorApp(
        HttpStatus.FORBIDDEN,
        'PROHIBIDO',
        'Solo las dos partes pueden ver este chat.',
      );
    }
    if (hilo.estado !== 'ACEPTADA') {
      throw new ErrorApp(
        HttpStatus.CONFLICT,
        'SIN_CHAT',
        'El chat se habilita cuando el autor acepta la reclamación.',
      );
    }
    return hilo;
  }
}
