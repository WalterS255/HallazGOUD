// Chat de una reclamación (§6.4) contra PostgreSQL real, con el flujo completo:
// reclamar → aceptar → conversar → confirmar entrega → solo lectura.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuditoriaService } from '../../src/lib/auditoria/auditoria.service.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { PublicacionesRepository } from '../../src/modules/publicaciones/publicaciones.repository.js';
import { PublicacionesService } from '../../src/modules/publicaciones/publicaciones.service.js';
import { MensajesRepository } from '../../src/modules/reclamaciones/mensajes.repository.js';
import { MensajesService } from '../../src/modules/reclamaciones/mensajes.service.js';
import { ReclamacionesRepository } from '../../src/modules/reclamaciones/reclamaciones.repository.js';
import { ReclamacionesService } from '../../src/modules/reclamaciones/reclamaciones.service.js';
import { clienteTest, crearPublicacion, crearUsuario } from './ayudas.js';

let prisma: PrismaClient;
let reclamaciones: ReclamacionesService;
let chat: MensajesService;

beforeAll(() => {
  prisma = clienteTest();
  const bd = prisma as unknown as PrismaService;
  const auditoria = new AuditoriaService(bd);
  const publicaciones = new PublicacionesService(new PublicacionesRepository(bd), auditoria);
  reclamaciones = new ReclamacionesService(
    new ReclamacionesRepository(bd),
    publicaciones,
    auditoria,
  );
  chat = new MensajesService(new MensajesRepository(bd));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function reclamacionPendiente() {
  const [autor, reclamante, intruso] = [
    await crearUsuario(prisma),
    await crearUsuario(prisma),
    await crearUsuario(prisma),
  ];
  const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO', id_usuario: autor.id });
  const { id } = await reclamaciones.crear({
    id_publicacion: pub.id,
    id_reclamante: reclamante.id,
    respuesta_detalle: 'tiene un sticker',
  });
  return { id, autor: autor.id, reclamante: reclamante.id, intruso: intruso.id };
}

describe('chat de una reclamación (BD real)', () => {
  it('no existe mientras la reclamación está PENDIENTE', async () => {
    const r = await reclamacionPendiente();
    await expect(chat.enviar(r.id, r.reclamante, 'hola')).rejects.toMatchObject({
      codigo: 'SIN_CHAT',
    });
  });

  it('las dos partes conversan; un tercero no puede leer ni escribir', async () => {
    const r = await reclamacionPendiente();
    await reclamaciones.resolver(r.id, r.autor, 'ACEPTAR');

    await chat.enviar(r.id, r.autor, '¿Te sirve mañana a las 10 en la biblioteca?');
    await chat.enviar(r.id, r.reclamante, '  ¡Perfecto!  ');
    const hilo = await chat.listar(r.id, r.reclamante);
    expect(hilo.map((m) => [m.emisor.id, m.contenido])).toEqual([
      [r.autor, '¿Te sirve mañana a las 10 en la biblioteca?'],
      [r.reclamante, '¡Perfecto!'], // se guardó sin los espacios de los lados
    ]);
    expect(Object.keys(hilo[0].emisor).sort()).toEqual(['id', 'nombre']);

    await expect(chat.listar(r.id, r.intruso)).rejects.toMatchObject({ codigo: 'PROHIBIDO' });
    await expect(chat.enviar(r.id, r.intruso, 'hola')).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
  });

  it('al abrir el hilo, se marca como leído solo lo que mandó la otra parte', async () => {
    const r = await reclamacionPendiente();
    await reclamaciones.resolver(r.id, r.autor, 'ACEPTAR');
    await chat.enviar(r.id, r.autor, 'mensaje del autor');
    await chat.enviar(r.id, r.reclamante, 'mensaje del reclamante');

    await chat.listar(r.id, r.reclamante);
    const leidos = await prisma.mensaje.findMany({
      where: { id_reclamacion: r.id },
      select: { id_emisor: true, leido: true },
      orderBy: { id: 'asc' },
    });
    expect(leidos).toEqual([
      { id_emisor: r.autor, leido: true }, // lo leyó el reclamante
      { id_emisor: r.reclamante, leido: false }, // el autor todavía no lo abre
    ]);
  });

  it('después de la entrega el chat es de solo lectura', async () => {
    const r = await reclamacionPendiente();
    await reclamaciones.resolver(r.id, r.autor, 'ACEPTAR');
    await chat.enviar(r.id, r.autor, 'aquí estoy');
    await reclamaciones.confirmarEntrega(r.id, r.autor);
    await reclamaciones.confirmarEntrega(r.id, r.reclamante);

    await expect(chat.enviar(r.id, r.reclamante, 'gracias')).rejects.toMatchObject({
      codigo: 'CHAT_CERRADO',
    });
    await expect(chat.listar(r.id, r.reclamante)).resolves.toHaveLength(1);
  });

  it('rechaza mensajes vacíos o de más de 2000 caracteres', async () => {
    const r = await reclamacionPendiente();
    await reclamaciones.resolver(r.id, r.autor, 'ACEPTAR');
    for (const malo of ['   ', 'x'.repeat(2001)]) {
      await expect(chat.enviar(r.id, r.autor, malo)).rejects.toMatchObject({
        codigo: 'MENSAJE_INVALIDO',
      });
    }
  });
});
