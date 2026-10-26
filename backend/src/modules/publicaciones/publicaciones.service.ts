import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { causaDe, type EstadoPublicacion } from './estados.js';
import { PublicacionesRepository, type Tx } from './publicaciones.repository.js';

export interface QuienCambia {
  id_usuario: number | null; // null = el sistema (cron de expiración)
  ip?: string | null;
  motivo?: string; // si no se da, se usa la causa de la tabla de transiciones
}

export interface CambioEstado {
  desde: EstadoPublicacion;
  hacia: EstadoPublicacion;
}

@Injectable()
export class PublicacionesService {
  constructor(
    private readonly repo: PublicacionesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  // Único camino para cambiar el estado de una publicación (§6.1): valida la
  // transición y escribe estado + historial + auditoría en UNA transacción.
  // Quién PUEDE pedir cada cambio (autor, moderador…) lo deciden los guards y
  // los servicios que llaman a este; aquí solo se garantiza que el cambio sea válido.
  cambiarEstado(id: number, hacia: EstadoPublicacion, quien: QuienCambia): Promise<CambioEstado> {
    return this.repo.enTransaccion((tx) => this.cambiarEstadoEn(tx, id, hacia, quien));
  }

  // Lo mismo, pero DENTRO de una transacción que ya abrió otro servicio (por ejemplo,
  // aceptar una reclamación: reclamación + entrega + estado deben guardarse juntos).
  async cambiarEstadoEn(
    tx: Tx,
    id: number,
    hacia: EstadoPublicacion,
    quien: QuienCambia,
  ): Promise<CambioEstado> {
    const actual = await this.repo.bloquearParaCambio(tx, id);
    if (!actual) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'PUBLICACION_NO_ENCONTRADA',
        'La publicación no existe.',
      );
    }
    const desde = actual.estado;
    const causa = causaDe(desde, hacia);
    if (!causa) {
      throw new ErrorApp(
        HttpStatus.CONFLICT,
        'TRANSICION_INVALIDA',
        `Una publicación ${desde} no puede pasar a ${hacia}.`,
      );
    }
    const motivo = quien.motivo ?? causa;

    await this.repo.guardarEstado(tx, id, hacia);
    await this.repo.agregarHistorial(tx, {
      id_publicacion: id,
      estado_anterior: desde,
      estado_nuevo: hacia,
      id_usuario: quien.id_usuario,
      motivo,
    });
    await this.auditoria.registrar(
      {
        accion: 'PUBLICACION_CAMBIO_ESTADO',
        entidad: 'publicacion',
        id_entidad: id,
        id_usuario: quien.id_usuario,
        detalle: { desde, hacia, motivo },
        ip: quien.ip,
      },
      tx,
    );
    return { desde, hacia };
  }
}
