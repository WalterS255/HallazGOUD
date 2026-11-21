import sharp from 'sharp';
import type { AlmacenamientoService } from '../../lib/almacenamiento/almacenamiento.service.js';
import type { AuthRepository } from './auth.repository.js';
import { PerfilService } from './perfil.service.js';

// Pruebas UNITARIAS del perfil (RF-05): ver, editar y la foto. El flujo HTTP real está en
// test/db/perfil.db-spec.ts.

const png = () =>
  sharp({ create: { width: 50, height: 40, channels: 3, background: '#cc6633' } })
    .png()
    .toBuffer();
const FOTO_VIEJA = '/api/imagenes/usuarios/7/11111111-2222-4333-8444-555555555555.webp';

function armar(
  o: { perfil?: object | null; anterior?: string | null; guardarFalla?: boolean } = {},
) {
  const enS3: string[] = [];
  const borradasS3: string[] = [];
  const fotosGuardadas: (string | null)[] = [];
  const repo = {
    perfil: async () => (o.perfil === undefined ? { id: 7, nombre: 'Ana' } : o.perfil),
    actualizarPerfil: async () => undefined,
    fotoDe: async () => o.anterior ?? null,
    guardarFoto: async (_id: number, url: string | null) => {
      if (o.guardarFalla) throw new Error('la BD se cayó');
      fotosGuardadas.push(url);
    },
    cuentaVisible: async () => true,
  } as unknown as AuthRepository;
  const almacenamiento = {
    subir: async (clave: string) => {
      enS3.push(clave);
    },
    borrarSinRomper: async (clave: string) => {
      borradasS3.push(clave);
    },
    leer: async () => ({ cuerpo: Buffer.from('x') }),
  } as unknown as AlmacenamientoService;
  return { servicio: new PerfilService(repo, almacenamiento), enS3, borradasS3, fotosGuardadas };
}

describe('PerfilService', () => {
  it('ver: devuelve el perfil; si la cuenta no existe → 404', async () => {
    await expect(armar().servicio.ver(7)).resolves.toEqual({ id: 7, nombre: 'Ana' });
    await expect(armar({ perfil: null }).servicio.ver(7)).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
    });
  });

  it('editar: guarda y devuelve el perfil actualizado', async () => {
    await expect(armar().servicio.editar(7, { nombre: 'Ana María' })).resolves.toMatchObject({
      id: 7,
    });
  });

  it('cambiarFoto: sube la nueva, la guarda y DESPUÉS borra la anterior', async () => {
    const { servicio, enS3, borradasS3, fotosGuardadas } = armar({ anterior: FOTO_VIEJA });
    await servicio.cambiarFoto(7, { buffer: await png(), originalname: 'yo.png' });
    expect(enS3).toHaveLength(1);
    expect(enS3[0]).toMatch(/^usuarios\/7\/[0-9a-f-]{36}\.webp$/);
    expect(fotosGuardadas).toEqual([`/api/imagenes/${enS3[0]}`]);
    expect(borradasS3).toEqual([FOTO_VIEJA.slice('/api/imagenes/'.length)]);
  });

  it('cambiarFoto sin archivo → 400 SIN_IMAGENES', async () => {
    await expect(armar().servicio.cambiarFoto(7, undefined)).rejects.toMatchObject({
      codigo: 'SIN_IMAGENES',
    });
  });

  it('si guardar en la BD falla: borra la foto NUEVA y conserva la anterior', async () => {
    const { servicio, enS3, borradasS3 } = armar({ anterior: FOTO_VIEJA, guardarFalla: true });
    await expect(
      servicio.cambiarFoto(7, { buffer: await png(), originalname: 'yo.png' }),
    ).rejects.toThrow('la BD se cayó');
    expect(borradasS3).toEqual(enS3); // solo la nueva; la vieja sigue en su lugar
  });

  it('quitarFoto: pone null y borra el archivo; sin foto no hace nada', async () => {
    const con = armar({ anterior: FOTO_VIEJA });
    await con.servicio.quitarFoto(7);
    expect(con.fotosGuardadas).toEqual([null]);
    expect(con.borradasS3).toHaveLength(1);

    const sin = armar();
    await sin.servicio.quitarFoto(7);
    expect(sin.fotosGuardadas).toEqual([]);
    expect(sin.borradasS3).toEqual([]);
  });

  it('leerFoto: solo claves con la forma exacta de una foto de perfil', async () => {
    const { servicio } = armar();
    await expect(
      servicio.leerFoto(FOTO_VIEJA.slice('/api/imagenes/'.length)),
    ).resolves.toBeDefined();
    await expect(servicio.leerFoto('usuarios/7/../../.env')).rejects.toMatchObject({
      codigo: 'IMAGEN_NO_ENCONTRADA',
    });
  });
});
