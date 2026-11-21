import { Injectable } from '@nestjs/common';
import type { EstadoPublicacion } from '../publicaciones/estados.js';
import { type ConversacionFila, MiCuentaRepository } from './mi-cuenta.repository.js';

export interface Conversacion {
  id_reclamacion: number;
  publicacion: { id: number; titulo: string; estado: EstadoPublicacion };
  contraparte: { id: number; nombre: string | null };
  ultimo_mensaje: { contenido: string; fecha_envio: Date } | null;
  no_leidos: number;
}

// Regla: en un chat solo hay dos partes. Si yo soy el autor, la contraparte es el
// reclamante, y al revés. Función pura: se prueba sin base de datos.
export function aConversacion(fila: ConversacionFila, idUsuario: number): Conversacion {
  const soyAutor = fila.autor_id === idUsuario;
  return {
    id_reclamacion: fila.id_reclamacion,
    publicacion: { id: fila.id_publicacion, titulo: fila.titulo, estado: fila.estado_publicacion },
    contraparte: soyAutor
      ? { id: fila.reclamante_id, nombre: fila.reclamante_nombre }
      : { id: fila.autor_id, nombre: fila.autor_nombre },
    ultimo_mensaje:
      fila.ultimo_contenido !== null && fila.ultima_fecha !== null
        ? { contenido: fila.ultimo_contenido, fecha_envio: fila.ultima_fecha }
        : null,
    no_leidos: fila.no_leidos,
  };
}

// Todo sale del id del TOKEN, nunca de la URL: así nadie puede pedir lo de otra persona.
@Injectable()
export class MiCuentaService {
  constructor(private readonly repo: MiCuentaRepository) {}

  publicaciones(idUsuario: number) {
    return this.repo.publicaciones(idUsuario);
  }

  reclamaciones(idUsuario: number) {
    return this.repo.reclamaciones(idUsuario);
  }

  async conversaciones(idUsuario: number): Promise<Conversacion[]> {
    const filas = await this.repo.conversaciones(idUsuario);
    return filas.map((f) => aConversacion(f, idUsuario));
  }
}
