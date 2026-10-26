import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { Hilo, MensajesRepository } from './mensajes.repository.js';
import { MensajesService } from './mensajes.service.js';

// Falsos: el hilo es de la autora 1 y el reclamante 2. Lecturas y transacciones
// reales: test/db/mensajes.db-spec.ts.
function armar(hilo: Partial<Hilo> | null = {}) {
  const llamadas: string[] = [];
  const repo = {
    hilo: async () =>
      hilo === null
        ? null
        : {
            estado: 'ACEPTADA',
            id_autor: 1,
            id_reclamante: 2,
            id_publicacion: 9,
            entregada: false,
            titulo: 'Termo',
            ...hilo,
          },
    listarYMarcarLeidos: async (_id: number, lector: number) => {
      llamadas.push(`listar:${lector}`);
      return [];
    },
    crear: async (d: { contenido: string }) => {
      llamadas.push(`crear:${d.contenido}`);
      return { id: 1 };
    },
  } as unknown as MensajesRepository;
  const notificaciones = {
    avisar: async (a: { id_usuario: number }) => {
      llamadas.push(`aviso->${a.id_usuario}`);
    },
  } as unknown as NotificacionesService;
  return { servicio: new MensajesService(repo, notificaciones), llamadas };
}

describe('MensajesService', () => {
  it('enviar recorta el texto, guarda y avisa a la OTRA parte', async () => {
    const { servicio, llamadas } = armar();
    await servicio.enviar(5, 2, '  hola  ');
    expect(llamadas).toEqual(['crear:hola', 'aviso->1']);
  });

  it('listar es solo para las dos partes', async () => {
    const { servicio, llamadas } = armar();
    await servicio.listar(5, 1);
    expect(llamadas).toEqual(['listar:1']);
    await expect(servicio.listar(5, 99)).rejects.toMatchObject({ codigo: 'PROHIBIDO' });
  });

  it.each([
    [null, 'PROHIBIDO'], // no existe: mismo error que "no eres parte"
    [{ estado: 'PENDIENTE' }, 'SIN_CHAT'],
    [{ entregada: true }, 'CHAT_CERRADO'],
  ])('hilo %j → %s, sin guardar ni avisar', async (hilo, codigo) => {
    const { servicio, llamadas } = armar(hilo);
    await expect(servicio.enviar(5, 2, 'hola')).rejects.toMatchObject({ codigo });
    expect(llamadas).toEqual([]);
  });

  it.each(['   ', 'x'.repeat(2001)])('mensaje inválido (%#) → MENSAJE_INVALIDO', async (texto) => {
    await expect(armar().servicio.enviar(5, 2, texto)).rejects.toMatchObject({
      codigo: 'MENSAJE_INVALIDO',
    });
  });
});
