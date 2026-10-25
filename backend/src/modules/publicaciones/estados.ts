// Máquina de estados de una publicación (regla 6.1, RF-11).
//
//              ACEPTAR_RECLAMACION              CONFIRMAR_ENTREGA
//   ACTIVA ───────────────────────────► EN_RECLAMACION ─────────────────► ENTREGADA (final)
//     │  ▲                                    │
//     │  └──────── REVERTIR_RECLAMACION ──────┘
//     ├── EXPIRAR (cron, 90 días) ──► EXPIRADA (final)
//     └── RETIRAR (autor/moderador) ─► RETIRADA (final)
//
// Las transiciones permitidas viven SOLO aquí. El servicio nunca escribe
// `estado = 'ENTREGADA'` a mano: pide `aplicarEvento(actual, 'CONFIRMAR_ENTREGA')`
// y esta función decide. Cualquier otra combinación lanza un error 409.
// Es pura: no toca la BD. El servicio guarda el resultado, más historial_estado y
// auditoria, en una sola transacción.
import { HttpStatus } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';

// Mismos valores que el enum estado_publicacion de la BD.
export type EstadoPublicacion = 'ACTIVA' | 'EN_RECLAMACION' | 'ENTREGADA' | 'EXPIRADA' | 'RETIRADA';

export type EventoPublicacion =
  | 'ACEPTAR_RECLAMACION'
  | 'REVERTIR_RECLAMACION' // supuesto de la pregunta abierta 13.4 (sin confirmar)
  | 'CONFIRMAR_ENTREGA'
  | 'EXPIRAR'
  | 'RETIRAR';

// Para cada estado, qué eventos acepta y a qué estado lleva cada uno.
// Un estado sin eventos (ENTREGADA, EXPIRADA, RETIRADA) es FINAL.
const TRANSICIONES: Record<
  EstadoPublicacion,
  Partial<Record<EventoPublicacion, EstadoPublicacion>>
> = {
  ACTIVA: {
    ACEPTAR_RECLAMACION: 'EN_RECLAMACION',
    EXPIRAR: 'EXPIRADA',
    RETIRAR: 'RETIRADA',
  },
  EN_RECLAMACION: {
    CONFIRMAR_ENTREGA: 'ENTREGADA',
    REVERTIR_RECLAMACION: 'ACTIVA',
  },
  ENTREGADA: {},
  EXPIRADA: {},
  RETIRADA: {},
};

export function aplicarEvento(
  actual: EstadoPublicacion,
  evento: EventoPublicacion,
): EstadoPublicacion {
  const siguiente = TRANSICIONES[actual][evento];
  if (!siguiente) {
    throw new ErrorApp(
      HttpStatus.CONFLICT,
      'TRANSICION_INVALIDA',
      `No se puede ${DESCRIPCION[evento]} una publicación en estado ${actual}.`,
    );
  }
  return siguiente;
}

export function esFinal(estado: EstadoPublicacion): boolean {
  return Object.keys(TRANSICIONES[estado]).length === 0;
}

// RF-10: se puede editar mientras no haya terminado (ENTREGADA, EXPIRADA, RETIRADA no).
export function sePuedeEditar(estado: EstadoPublicacion): boolean {
  return !esFinal(estado);
}

const DESCRIPCION: Record<EventoPublicacion, string> = {
  ACEPTAR_RECLAMACION: 'aceptar una reclamación de',
  REVERTIR_RECLAMACION: 'revertir la reclamación de',
  CONFIRMAR_ENTREGA: 'confirmar la entrega de',
  EXPIRAR: 'expirar',
  RETIRAR: 'retirar',
};
