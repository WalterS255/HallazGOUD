import { describe, expect, it } from 'vitest';
import type { ConversacionFila } from './mi-cuenta.repository.js';
import { aConversacion } from './mi-cuenta.service.js';

const fila = (o: Partial<ConversacionFila> = {}): ConversacionFila => ({
  id_reclamacion: 7,
  id_publicacion: 41,
  titulo: 'Calculadora',
  estado_publicacion: 'EN_RECLAMACION',
  autor_id: 1,
  autor_nombre: 'Ana',
  reclamante_id: 2,
  reclamante_nombre: 'Luis',
  ultimo_contenido: '¿Mañana?',
  ultima_fecha: new Date('2026-10-25T15:00:00Z'),
  fecha_aceptacion: new Date('2026-10-25T13:00:00Z'),
  no_leidos: 1,
  ...o,
});

describe('aConversacion', () => {
  it('si soy el autor, la contraparte es el reclamante', () => {
    expect(aConversacion(fila(), 1).contraparte).toEqual({ id: 2, nombre: 'Luis' });
  });

  it('si soy el reclamante, la contraparte es el autor', () => {
    expect(aConversacion(fila(), 2).contraparte).toEqual({ id: 1, nombre: 'Ana' });
  });

  it('sin mensajes, ultimo_mensaje es null', () => {
    const c = aConversacion(fila({ ultimo_contenido: null, ultima_fecha: null }), 1);
    expect(c.ultimo_mensaje).toBeNull();
  });

  it('arma la forma que espera el frontend', () => {
    expect(aConversacion(fila(), 1)).toEqual({
      id_reclamacion: 7,
      publicacion: { id: 41, titulo: 'Calculadora', estado: 'EN_RECLAMACION' },
      contraparte: { id: 2, nombre: 'Luis' },
      ultimo_mensaje: { contenido: '¿Mañana?', fecha_envio: new Date('2026-10-25T15:00:00Z') },
      no_leidos: 1,
    });
  });
});
