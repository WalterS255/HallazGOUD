// Máquina de estados de una publicación (CLAUDE.md §6.1), en UN solo lugar.
//
//              reclamación aceptada            doble confirmación
//   ACTIVA ───────────────────────────► EN_RECLAMACION ───────────────► ENTREGADA (final)
//     │  ▲                                    │
//     │  └──── reclamación aceptada se ───────┘
//     │        cancela o se revierte
//     ├── 90 días sin actividad ──► EXPIRADA (cron)
//     └── autor o moderador retira ─► RETIRADA
//
// Cualquier transición que no esté en esta tabla es inválida.
import type { estado_publicacion } from '../../generated/prisma/client.js';

export type EstadoPublicacion = estado_publicacion;

// Para cada estado: a qué estados se puede pasar y por qué causa (va al historial).
export const TRANSICIONES: Readonly<
  Record<EstadoPublicacion, Partial<Record<EstadoPublicacion, string>>>
> = {
  ACTIVA: {
    EN_RECLAMACION: 'Reclamación aceptada',
    EXPIRADA: '90 días sin actividad',
    RETIRADA: 'Retirada por el autor o un moderador',
  },
  EN_RECLAMACION: {
    ENTREGADA: 'Entrega con doble confirmación',
    // Supuesto de la pregunta abierta 13.4 (si el reclamante no aparece). Confirmar con Walter.
    ACTIVA: 'Reclamación aceptada cancelada o revertida',
  },
  ENTREGADA: {},
  EXPIRADA: {},
  RETIRADA: {},
};

export const ESTADOS_FINALES: readonly EstadoPublicacion[] = ['ENTREGADA', 'EXPIRADA', 'RETIRADA'];

export function esTransicionValida(desde: EstadoPublicacion, hacia: EstadoPublicacion): boolean {
  return hacia in TRANSICIONES[desde];
}

export function causaDe(desde: EstadoPublicacion, hacia: EstadoPublicacion): string | undefined {
  return TRANSICIONES[desde][hacia];
}

// RF-10: el autor puede editar mientras la publicación no esté en un estado final.
export function esEditable(estado: EstadoPublicacion): boolean {
  return !ESTADOS_FINALES.includes(estado);
}
