import sharp from 'sharp';
import type { AlmacenamientoService } from '../../lib/almacenamiento/almacenamiento.service.js';
import type { GestionRepository } from './gestion.repository.js';
import type { ImagenesRepository } from './imagenes.repository.js';
import { ImagenesService } from './imagenes.service.js';

// Pruebas UNITARIAS de las imágenes de una publicación (RF-08). El procesamiento con Sharp
// es real (una imagen generada en memoria); el bucket y la BD son falsos.
// La concurrencia (FOR UPDATE, máximo 5) se prueba contra PostgreSQL en test/db/imagenes.db-spec.ts.

const png = () =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: '#3366cc' } })
    .png()
    .toBuffer();
const archivo = async () => ({ buffer: await png(), originalname: 'foto.png' });
const ctx = (id = 1) => ({ usuario: { id, rol: 'USUARIO' as const }, ip: null });

function armar(
  o: {
    pub?: { id_usuario: number; estado: string } | null;
    usados?: number[];
    crearFalla?: boolean;
    borrada?: { url: string; url_miniatura: string } | null;
    visible?: boolean;
    enBucket?: boolean;
  } = {},
) {
  const enS3: string[] = [];
  const borradasS3: string[] = [];
  const llamadas: string[] = [];
  const repo = {
    enTransaccion: async <T>(f: (tx: unknown) => Promise<T>) => f('tx'),
    ordenesUsados: async () => o.usados ?? [],
    crear: async (_tx: unknown, d: { orden: number }) => {
      if (o.crearFalla) throw new Error('la BD se cayó');
      llamadas.push(`crear:${d.orden}`);
    },
    marcarActividad: async () => {
      llamadas.push('actividad');
    },
    listar: async () => [{ orden: 1 }],
    borrar: async () =>
      o.borrada === undefined
        ? {
            url: '/api/imagenes/publicaciones/41/a.webp',
            url_miniatura: '/api/imagenes/publicaciones/41/a_min.webp',
          }
        : o.borrada,
    publicacionVisible: async () => o.visible ?? true,
  } as unknown as ImagenesRepository;
  const gestion = {
    paraEditar: async () => (o.pub === undefined ? { id_usuario: 1, estado: 'ACTIVA' } : o.pub),
  } as unknown as GestionRepository;
  const almacenamiento = {
    subir: async (clave: string) => {
      enS3.push(clave);
    },
    borrarSinRomper: async (clave: string) => {
      borradasS3.push(clave);
    },
    leer: async () => (o.enBucket === false ? null : { cuerpo: Buffer.from('x') }),
  } as unknown as AlmacenamientoService;
  return {
    servicio: new ImagenesService(repo, gestion, almacenamiento),
    enS3,
    borradasS3,
    llamadas,
  };
}

describe('ImagenesService.subir', () => {
  it('sube grande + miniatura por foto, usa los órdenes libres y marca actividad', async () => {
    const { servicio, enS3, llamadas } = armar({ usados: [1, 3] });
    await servicio.subir(41, [await archivo(), await archivo()], ctx());
    expect(enS3).toHaveLength(4); // 2 fotos × (grande + _min)
    expect(enS3.every((c) => /^publicaciones\/41\/[0-9a-f-]{36}(_min)?\.webp$/.test(c))).toBe(true);
    expect(llamadas).toEqual(['crear:2', 'crear:4', 'actividad']);
  });

  it('sin archivos → 400 SIN_IMAGENES', async () => {
    const { servicio } = armar();
    await expect(servicio.subir(41, [], ctx())).rejects.toMatchObject({ codigo: 'SIN_IMAGENES' });
  });

  it('un archivo que no es imagen → 400 y no se sube NADA (ni las buenas)', async () => {
    const { servicio, enS3 } = armar();
    const falso = { buffer: Buffer.from('no soy una imagen'), originalname: 'virus.png' };
    await expect(servicio.subir(41, [await archivo(), falso], ctx())).rejects.toMatchObject({
      codigo: 'IMAGEN_INVALIDA',
    });
    expect(enS3).toEqual([]);
  });

  it('pasaría de 5 → 409 DEMASIADAS_IMAGENES', async () => {
    const { servicio, enS3 } = armar({ usados: [1, 2, 3, 4] });
    await expect(
      servicio.subir(41, [await archivo(), await archivo()], ctx()),
    ).rejects.toMatchObject({ codigo: 'DEMASIADAS_IMAGENES' });
    expect(enS3).toEqual([]);
  });

  it.each([
    ['no existe', null, 'PUBLICACION_NO_ENCONTRADA'],
    ['es de otra persona', { id_usuario: 99, estado: 'ACTIVA' }, 'PROHIBIDO'],
    ['ya se entregó', { id_usuario: 1, estado: 'ENTREGADA' }, 'PUBLICACION_NO_EDITABLE'],
  ])('si la publicación %s → %s', async (_c, pub, codigo) => {
    const { servicio } = armar({ pub });
    await expect(servicio.subir(41, [await archivo()], ctx())).rejects.toMatchObject({ codigo });
  });

  it('si la BD falla después de subir a S3, borra de S3 lo que alcanzó a subir', async () => {
    const { servicio, enS3, borradasS3 } = armar({ crearFalla: true });
    await expect(servicio.subir(41, [await archivo()], ctx())).rejects.toThrow('la BD se cayó');
    expect(enS3).toHaveLength(2);
    expect(borradasS3).toEqual(enS3); // no quedan archivos huérfanos
  });
});

describe('ImagenesService.borrar', () => {
  it('borra en la BD y DESPUÉS la grande y la miniatura en S3', async () => {
    const { servicio, borradasS3, llamadas } = armar();
    expect(await servicio.borrar(41, 1, ctx())).toEqual({ orden: 1, borrada: true });
    expect(llamadas).toEqual(['actividad']);
    expect(borradasS3).toEqual(['publicaciones/41/a.webp', 'publicaciones/41/a_min.webp']);
  });

  it('orden sin imagen → 404; otra persona → 403', async () => {
    await expect(armar({ borrada: null }).servicio.borrar(41, 5, ctx())).rejects.toMatchObject({
      codigo: 'IMAGEN_NO_ENCONTRADA',
    });
    await expect(armar().servicio.borrar(41, 1, ctx(99))).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
  });
});

describe('ImagenesService.leer (bucket privado)', () => {
  const clave = 'publicaciones/41/0b4f1c2e-1234-4abc-9def-0123456789ab_min.webp';

  it('una clave con la forma exacta y publicación visible → el archivo', async () => {
    await expect(armar().servicio.leer(clave)).resolves.toBeDefined();
  });

  it.each([
    ['intenta salir de la carpeta', '../../.env'],
    ['no es webp', 'publicaciones/41/0b4f1c2e-1234-4abc-9def-0123456789ab.png'],
    ['es de otra carpeta', 'usuarios/1/0b4f1c2e-1234-4abc-9def-0123456789ab.webp'],
  ])('una clave que %s → 404', async (_c, mala) => {
    await expect(armar().servicio.leer(mala)).rejects.toMatchObject({
      codigo: 'IMAGEN_NO_ENCONTRADA',
    });
  });

  it('publicación oculta por moderación → 404 (no revela que existe)', async () => {
    await expect(armar({ visible: false }).servicio.leer(clave)).rejects.toMatchObject({
      codigo: 'IMAGEN_NO_ENCONTRADA',
    });
  });

  it('el archivo ya no está en el bucket → 404', async () => {
    await expect(armar({ enBucket: false }).servicio.leer(clave)).rejects.toMatchObject({
      codigo: 'IMAGEN_NO_ENCONTRADA',
    });
  });
});
