import type { Correo, CorreoService } from '../../lib/correo/correo.service.js';
import type { NotificacionesRepository } from './notificaciones.repository.js';
import { type Aviso, NotificacionesService } from './notificaciones.service.js';

type Destinatario = {
  nombre: string | null;
  correo: string | null;
  notificar_por_correo: boolean;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'ELIMINADA';
};

// Repositorio y correo FALSOS: anotan qué se guardó y qué se envió.
function armar(o: {
  destinatario?: Destinatario | null;
  repetida?: boolean;
  fallaCrear?: boolean;
  fallaCorreo?: boolean;
}) {
  const guardadas: unknown[] = [];
  const enviados: Correo[] = [];
  const repo = {
    hayIgualSinLeer: async () => o.repetida ?? false,
    crear: async (d: unknown) => {
      if (o.fallaCrear) throw new Error('la BD se cayó');
      guardadas.push(d);
    },
    destinatario: async () =>
      o.destinatario === undefined
        ? {
            nombre: 'Ana',
            correo: 'ana@udistrital.edu.co',
            notificar_por_correo: true,
            estado_cuenta: 'ACTIVA',
          }
        : o.destinatario,
  } as unknown as NotificacionesRepository;
  const correo = {
    enviar: async (c: Correo) => {
      if (o.fallaCorreo) throw new Error('SMTP caído');
      enviados.push(c);
    },
  } as unknown as CorreoService;
  return { servicio: new NotificacionesService(repo, correo), guardadas, enviados };
}

const aviso: Aviso = {
  id_usuario: 1,
  tipo: 'RECLAMACION',
  mensaje: 'Alguien reclamó tu publicación «Termo <b>azul</b>»',
  id_referencia: 9,
  ruta: '/publicaciones/9',
};

describe('NotificacionesService.avisar', () => {
  it('guarda el aviso y manda el correo con el enlace a la app', async () => {
    const { servicio, guardadas, enviados } = armar({});
    await servicio.avisar(aviso);
    expect(guardadas).toEqual([
      { id_usuario: 1, tipo: 'RECLAMACION', mensaje: aviso.mensaje, id_referencia: 9 },
    ]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe('ana@udistrital.edu.co');
    expect(enviados[0].texto).toContain('/publicaciones/9');
  });

  it('escapa el HTML de lo que escribió un usuario (el título)', async () => {
    const { servicio, enviados } = armar({});
    await servicio.avisar(aviso);
    expect(enviados[0].html).toContain('&lt;b&gt;azul&lt;/b&gt;');
    expect(enviados[0].html).not.toContain('<b>azul</b>');
  });

  it('respeta notificar_por_correo = false: aviso en la app, sin correo', async () => {
    const { servicio, guardadas, enviados } = armar({
      destinatario: {
        nombre: 'Ana',
        correo: 'ana@udistrital.edu.co',
        notificar_por_correo: false,
        estado_cuenta: 'ACTIVA',
      },
    });
    await servicio.avisar(aviso);
    expect(guardadas).toHaveLength(1);
    expect(enviados).toHaveLength(0);
  });

  it('no escribe a cuentas suspendidas ni anonimizadas', async () => {
    for (const estado_cuenta of ['SUSPENDIDA', 'ELIMINADA'] as const) {
      const { servicio, enviados } = armar({
        destinatario: { nombre: null, correo: null, notificar_por_correo: true, estado_cuenta },
      });
      await servicio.avisar(aviso);
      expect(enviados).toHaveLength(0);
    }
  });

  it('si ya hay uno igual sin leer, no repite el correo (un chat activo no llena la bandeja)', async () => {
    const { servicio, guardadas, enviados } = armar({ repetida: true });
    await servicio.avisar(aviso);
    expect(guardadas).toHaveLength(1);
    expect(enviados).toHaveLength(0);
  });

  it('NUNCA lanza: si la BD o el SMTP fallan, la acción principal no se deshace', async () => {
    await expect(armar({ fallaCrear: true }).servicio.avisar(aviso)).resolves.toBeUndefined();
    await expect(armar({ fallaCorreo: true }).servicio.avisar(aviso)).resolves.toBeUndefined();
  });
});
