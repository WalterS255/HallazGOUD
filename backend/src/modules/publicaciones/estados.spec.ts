import { ErrorApp } from '../../comun/errores/error-app.js';
import {
  aplicarEvento,
  esFinal,
  type EstadoPublicacion,
  type EventoPublicacion,
  sePuedeEditar,
} from './estados.js';

const ESTADOS: EstadoPublicacion[] = [
  'ACTIVA',
  'EN_RECLAMACION',
  'ENTREGADA',
  'EXPIRADA',
  'RETIRADA',
];
const EVENTOS: EventoPublicacion[] = [
  'ACEPTAR_RECLAMACION',
  'REVERTIR_RECLAMACION',
  'CONFIRMAR_ENTREGA',
  'EXPIRAR',
  'RETIRAR',
];

// Las ÚNICAS transiciones válidas, copiadas del diagrama de la regla 6.1.
// Si alguien agrega una al código sin actualizar el diagrama, la prueba de abajo falla.
const VALIDAS: Record<string, EstadoPublicacion> = {
  'ACTIVA + ACEPTAR_RECLAMACION': 'EN_RECLAMACION',
  'ACTIVA + EXPIRAR': 'EXPIRADA',
  'ACTIVA + RETIRAR': 'RETIRADA',
  'EN_RECLAMACION + CONFIRMAR_ENTREGA': 'ENTREGADA',
  'EN_RECLAMACION + REVERTIR_RECLAMACION': 'ACTIVA',
};

describe('aplicarEvento', () => {
  // Recorre TODAS las combinaciones (5 estados × 5 eventos = 25): las 5 válidas
  // llevan al estado del diagrama y las otras 20 lanzan 409.
  for (const estado of ESTADOS) {
    for (const evento of EVENTOS) {
      const clave = `${estado} + ${evento}`;
      const esperado = VALIDAS[clave];
      if (esperado) {
        it(`${clave} → ${esperado}`, () => {
          expect(aplicarEvento(estado, evento)).toBe(esperado);
        });
      } else {
        it(`${clave} → error 409`, () => {
          let error: unknown;
          try {
            aplicarEvento(estado, evento);
          } catch (e) {
            error = e;
          }
          expect(error).toBeInstanceOf(ErrorApp);
          expect((error as ErrorApp).getStatus()).toBe(409);
          expect((error as ErrorApp).codigo).toBe('TRANSICION_INVALIDA');
        });
      }
    }
  }

  it('el mensaje dice qué se intentó y en qué estado', () => {
    expect(() => aplicarEvento('ENTREGADA', 'RETIRAR')).toThrow(
      'No se puede retirar una publicación en estado ENTREGADA.',
    );
  });
});

describe('estados finales y edición (RF-10)', () => {
  it.each<[EstadoPublicacion, boolean]>([
    ['ACTIVA', true],
    ['EN_RECLAMACION', true],
    ['ENTREGADA', false],
    ['EXPIRADA', false],
    ['RETIRADA', false],
  ])('%s: ¿se puede editar? %s', (estado, editable) => {
    expect(sePuedeEditar(estado)).toBe(editable);
    expect(esFinal(estado)).toBe(!editable);
  });
});
