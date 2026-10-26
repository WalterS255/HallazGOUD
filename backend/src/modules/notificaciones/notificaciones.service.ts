import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { CorreoService } from '../../lib/correo/correo.service.js';
import { correoAviso } from '../../lib/correo/plantillas-avisos.js';
import { NotificacionesRepository, type TipoNotificacion } from './notificaciones.repository.js';

export interface Aviso {
  id_usuario: number;
  tipo: TipoNotificacion;
  mensaje: string;
  id_referencia?: number | null;
  ruta: string; // a dónde lleva el correo en el frontend, p. ej. '/publicaciones/12'
}

export const LIMITE_NOTIFICACIONES = 50;

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly repo: NotificacionesRepository,
    private readonly correo: CorreoService,
  ) {}

  // RF-24 / RF-25. Se llama DESPUÉS de que la acción principal se guardó (fuera de su
  // transacción), y NUNCA lanza: si el aviso o el correo fallan, la reclamación, el
  // mensaje o la entrega ya quedaron hechos y no se deshacen por eso. Solo se registra.
  async avisar(aviso: Aviso): Promise<void> {
    try {
      const id_referencia = aviso.id_referencia ?? null;
      // Se mira ANTES de crear la nueva: ¿ya había una igual sin leer?
      const repetida = await this.repo.hayIgualSinLeer(aviso.id_usuario, aviso.tipo, id_referencia);
      await this.repo.crear({
        id_usuario: aviso.id_usuario,
        tipo: aviso.tipo,
        mensaje: aviso.mensaje,
        id_referencia,
      });

      const d = await this.repo.destinatario(aviso.id_usuario);
      const quiereCorreo = d?.notificar_por_correo && d.correo && d.estado_cuenta === 'ACTIVA';
      // Si ya tenía uno igual sin leer, no se repite el correo (un chat activo no
      // debe llenar la bandeja): el aviso en la app sí queda.
      if (quiereCorreo && !repetida) {
        await this.correo.enviar(correoAviso(d.correo!, d.nombre ?? '', aviso.mensaje, aviso.ruta));
      }
    } catch (error) {
      this.logger.error(error, `No se pudo avisar a ${aviso.id_usuario} (${aviso.tipo})`);
    }
  }

  // Para varios destinatarios a la vez (p. ej. las dos partes de una entrega).
  async avisarATodos(avisos: Aviso[]): Promise<void> {
    await Promise.all(avisos.map((a) => this.avisar(a)));
  }

  // GET /notificaciones
  listar(id_usuario: number, soloNoLeidas = false) {
    return this.repo.listar(id_usuario, soloNoLeidas, LIMITE_NOTIFICACIONES);
  }

  // PATCH /notificaciones/:id — 404 si no existe O si es de otra persona (no se
  // revela que existe).
  async marcarLeida(id: number, id_usuario: number): Promise<void> {
    if ((await this.repo.marcarLeida(id, id_usuario)) === 0) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'NOTIFICACION_NO_ENCONTRADA',
        'La notificación no existe.',
      );
    }
  }

  async marcarTodas(id_usuario: number): Promise<{ marcadas: number }> {
    return { marcadas: await this.repo.marcarTodas(id_usuario) };
  }
}
