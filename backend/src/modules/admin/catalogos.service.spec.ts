import { Prisma } from '../../generated/prisma/client.js';
import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { CatalogosRepository } from './catalogos.repository.js';
import { CatalogosService } from './catalogos.service.js';
import { type UsuariosAdminRepository, UsuariosAdminService } from './usuarios-admin.service.js';

const errorPrisma = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 't' });

function catalogoQueFalla(code: string) {
  const falla = async () => {
    throw errorPrisma(code);
  };
  return new CatalogosService({
    crearCategoria: falla,
    editarSede: falla,
    borrarSede: falla,
    crearLugar: falla,
  } as unknown as CatalogosRepository);
}

describe('CatalogosService: traduce los errores de la BD', () => {
  it.each([
    ['P2002', 'crearCategoria', 'NOMBRE_REPETIDO', 409],
    ['P2003', 'borrarSede', 'EN_USO', 409],
    ['P2025', 'editarSede', 'NO_ENCONTRADO', 404],
    ['P2003', 'crearLugar', 'SEDE_NO_EXISTE', 400], // al CREAR un lugar, la FK falla porque no hay sede
  ])('%s en %s → %s (%d)', async (code, metodo, codigo, estado) => {
    const s = catalogoQueFalla(code) as unknown as Record<
      string,
      (...a: unknown[]) => Promise<unknown>
    >;
    const error = await s[metodo](1, { nombre: 'x', id_sede: 1, edificio: 'y' }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ codigo });
    expect((error as { getStatus: () => number }).getStatus()).toBe(estado);
  });

  it('otros errores no se disfrazan', async () => {
    const s = new CatalogosService({
      crearSede: async () => {
        throw new Error('conexión perdida');
      },
    } as unknown as CatalogosRepository);
    await expect(s.crearSede('X')).rejects.toThrow('conexión perdida');
  });
});

function cuentas(estado: string | null) {
  const llamadas: string[] = [];
  const repo = {
    enTransaccion: async <T>(t: (tx: unknown) => Promise<T>) => t('tx'),
    bloquear: async () =>
      estado === null ? null : { id: 5, estado_cuenta: estado, nombre: 'Ana' },
    guardarEstado: async (_tx: unknown, _id: number, e: string) => {
      llamadas.push(`estado:${e}`);
      return { id: 5, estado_cuenta: e };
    },
  } as unknown as UsuariosAdminRepository;
  const auditoria = {
    registrar: async (e: { accion: string }) => {
      llamadas.push(`auditoria:${e.accion}`);
    },
  } as unknown as AuditoriaService;
  const notificaciones = {
    avisar: async () => {
      llamadas.push('aviso');
    },
  } as unknown as NotificacionesService;
  return { servicio: new UsuariosAdminService(repo, auditoria, notificaciones), llamadas };
}

describe('UsuariosAdminService.cambiarEstado', () => {
  it('suspender: estado, auditoría y DESPUÉS el aviso', async () => {
    const { servicio, llamadas } = cuentas('ACTIVA');
    await servicio.cambiarEstado(5, 'SUSPENDER', 1, 'spam');
    expect(llamadas).toEqual(['estado:SUSPENDIDA', 'auditoria:CUENTA_SUSPENDIDA', 'aviso']);
  });

  it.each([
    [5, 'ACTIVA', 'SUSPENDER', 'ACCION_SOBRE_SI_MISMO'], // el admin 5 sobre sí mismo
    [1, null, 'SUSPENDER', 'USUARIO_NO_ENCONTRADO'],
    [1, 'ELIMINADA', 'REACTIVAR', 'CUENTA_ELIMINADA'],
    [1, 'SUSPENDIDA', 'SUSPENDER', 'SIN_CAMBIO'],
  ] as const)('admin %d, cuenta %s, %s → %s', async (admin, estado, accion, codigo) => {
    const { servicio, llamadas } = cuentas(estado);
    await expect(servicio.cambiarEstado(5, accion, admin, undefined)).rejects.toMatchObject({
      codigo,
    });
    expect(llamadas).toEqual([]); // nada se guardó ni se avisó
  });
});
