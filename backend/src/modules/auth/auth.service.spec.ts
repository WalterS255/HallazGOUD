import type { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { Correo, CorreoService } from '../../lib/correo/correo.service.js';
import type { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { hashToken } from './tokens.js';

// Pruebas UNITARIAS: repositorio, auditoría, correo y JWT son FALSOS y anotan lo que se
// les pide. La lógica fina (bloqueo, tokens) ya se prueba en bloqueo.spec y tokens.spec;
// aquí se prueba cómo el servicio la orquesta. El flujo real contra PostgreSQL está en
// test/db/auth.db-spec.ts.

const CLAVE = 'clave-correcta-123';
const HASH = hashSync(CLAVE, 4); // coste bajo: solo para que la prueba sea rápida
const MIN = 60_000;

type Cuenta = {
  id: number;
  nombre: string | null;
  rol: 'USUARIO' | 'MODERADOR' | 'ADMIN';
  hash_contrasena: string;
  verificado: boolean;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'ELIMINADA';
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
};
const cuentaBase = (c: Partial<Cuenta> = {}): Cuenta => ({
  id: 7,
  nombre: 'Ana',
  rol: 'USUARIO',
  hash_contrasena: HASH,
  verificado: true,
  estado_cuenta: 'ACTIVA',
  intentos_fallidos: 0,
  bloqueado_hasta: null,
  ...c,
});

type TokenBd = {
  id: number;
  id_usuario: number;
  tipo: 'VERIFICACION' | 'RECUPERACION';
  expira_en: Date;
  usado_en: Date | null;
};

function armar(
  o: {
    cuenta?: Cuenta | null;
    token?: TokenBd | null;
    crearFalla?: unknown;
    correoFalla?: boolean;
    tokenYaUsadoPorOtra?: boolean;
    ultimoToken?: Date | null;
  } = {},
) {
  const llamadas: string[] = [];
  const auditadas: string[] = [];
  const correos: Correo[] = [];
  const repo = {
    buscarParaLogin: async () => (o.cuenta === undefined ? cuentaBase() : o.cuenta),
    transaccion: async <T>(f: (tx: unknown) => Promise<T>) => f('tx'),
    crearUsuario: async () => {
      if (o.crearFalla) throw o.crearFalla;
      llamadas.push('crearUsuario');
      return { id: 7 };
    },
    guardarToken: async (_id: number, tipo: string) => {
      llamadas.push(`guardarToken:${tipo}`);
    },
    buscarToken: async () => o.token ?? null,
    marcarTokenUsado: async () => {
      llamadas.push('marcarTokenUsado');
      return !o.tokenYaUsadoPorOtra;
    },
    marcarVerificado: async () => {
      llamadas.push('marcarVerificado');
    },
    guardarIntentos: async (_id: number, e: { intentosFallidos: number }) => {
      llamadas.push(`guardarIntentos:${e.intentosFallidos}`);
    },
    cambiarContrasena: async () => {
      llamadas.push('cambiarContrasena');
    },
    invalidarTokens: async (_id: number, tipo: string) => {
      llamadas.push(`invalidarTokens:${tipo}`);
    },
    ultimoToken: async () => o.ultimoToken ?? null,
  } as unknown as AuthRepository;
  const auditoria = {
    registrar: async (e: { accion: string }) => {
      auditadas.push(e.accion);
    },
  } as unknown as AuditoriaService;
  const correo = {
    enviar: async (c: Correo) => {
      if (o.correoFalla) throw new Error('SMTP caído');
      correos.push(c);
    },
  } as unknown as CorreoService;
  const jwt = {
    signAsync: async (p: { sub: number; rol: string }) => `jwt-${p.sub}-${p.rol}`,
  } as unknown as JwtService;
  return { servicio: new AuthService(repo, auditoria, correo, jwt), llamadas, auditadas, correos };
}

const ctx = { ip: '10.0.0.1' };
const tokenBd = (t: Partial<TokenBd> = {}): TokenBd => ({
  id: 3,
  id_usuario: 7,
  tipo: 'VERIFICACION',
  expira_en: new Date(Date.now() + 60 * MIN),
  usado_en: null,
  ...t,
});

describe('AuthService.registrar', () => {
  const datos = {
    nombre: 'Ana',
    correo: 'ana@udistrital.edu.co',
    programa: 'Sistemas',
    contrasena: CLAVE,
    aceptaPolitica: true as const,
  };

  it('crea la cuenta, guarda el token, audita y DESPUÉS envía el correo de activación', async () => {
    const { servicio, llamadas, auditadas, correos } = armar();
    const res = await servicio.registrar(datos, ctx);
    expect(res.mensaje).toContain('activar');
    expect(llamadas).toEqual(['crearUsuario', 'guardarToken:VERIFICACION']);
    expect(auditadas).toEqual(['CUENTA_REGISTRADA']);
    expect(correos).toHaveLength(1);
    expect(correos[0].para).toBe('ana@udistrital.edu.co');
  });

  it('correo ya registrado (P2002 de Prisma) → 409 CORREO_REGISTRADO, sin correo', async () => {
    const { servicio, correos } = armar({ crearFalla: { code: 'P2002' } });
    await expect(servicio.registrar(datos, ctx)).rejects.toMatchObject({
      codigo: 'CORREO_REGISTRADO',
    });
    expect(correos).toHaveLength(0);
  });

  it('otro error de la BD se propaga tal cual (no se disfraza de correo repetido)', async () => {
    const { servicio } = armar({ crearFalla: new Error('BD caída') });
    await expect(servicio.registrar(datos, ctx)).rejects.toThrow('BD caída');
  });

  it('si el correo falla, la cuenta igual queda creada y responde bien', async () => {
    const { servicio, llamadas } = armar({ correoFalla: true });
    await expect(servicio.registrar(datos, ctx)).resolves.toMatchObject({
      mensaje: expect.any(String),
    });
    expect(llamadas).toContain('crearUsuario');
  });
});

describe('AuthService.verificar', () => {
  it('enlace válido: lo marca usado, verifica la cuenta y audita', async () => {
    const { servicio, llamadas, auditadas } = armar({ token: tokenBd() });
    await servicio.verificar('cualquiera');
    expect(llamadas).toEqual(['marcarTokenUsado', 'marcarVerificado']);
    expect(auditadas).toEqual(['CUENTA_VERIFICADA']);
  });

  it.each([
    ['no existe', null, 'TOKEN_INVALIDO'],
    ['es de recuperación', tokenBd({ tipo: 'RECUPERACION' }), 'TOKEN_INVALIDO'],
    ['ya se usó', tokenBd({ usado_en: new Date() }), 'TOKEN_USADO'],
    ['venció', tokenBd({ expira_en: new Date(Date.now() - MIN) }), 'TOKEN_EXPIRADO'],
  ])('enlace que %s → %s', async (_caso, token, codigo) => {
    const { servicio, llamadas } = armar({ token });
    await expect(servicio.verificar('x')).rejects.toMatchObject({ codigo });
    expect(llamadas).not.toContain('marcarVerificado');
  });

  it('si otra petición lo usó una fracción antes → TOKEN_USADO y no verifica', async () => {
    const { servicio, llamadas } = armar({ token: tokenBd(), tokenYaUsadoPorOtra: true });
    await expect(servicio.verificar('x')).rejects.toMatchObject({ codigo: 'TOKEN_USADO' });
    expect(llamadas).not.toContain('marcarVerificado');
  });
});

describe('AuthService.login (regla 6.7)', () => {
  const login = (s: AuthService, contrasena = CLAVE) =>
    s.login({ correo: 'ana@udistrital.edu.co', contrasena }, ctx);

  it('clave correcta → JWT con sub y rol, y datos públicos (sin correo ni hash)', async () => {
    const { servicio } = armar();
    const sesion = await login(servicio);
    expect(sesion).toEqual({
      token: 'jwt-7-USUARIO',
      usuario: { id: 7, nombre: 'Ana', rol: 'USUARIO' },
    });
  });

  it('un login exitoso reinicia el contador de intentos', async () => {
    const { servicio, llamadas } = armar({ cuenta: cuentaBase({ intentos_fallidos: 3 }) });
    await login(servicio);
    expect(llamadas).toContain('guardarIntentos:0');
  });

  it('sin intentos previos no escribe nada en la BD', async () => {
    const { servicio, llamadas } = armar();
    await login(servicio);
    expect(llamadas).toEqual([]);
  });

  it('clave mala → 401 genérico, suma un intento y audita LOGIN_FALLIDO', async () => {
    const { servicio, llamadas, auditadas } = armar();
    await expect(login(servicio, 'otra-clave-123')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      message: 'Correo o contraseña incorrectos.',
    });
    expect(llamadas).toEqual(['guardarIntentos:1']);
    expect(auditadas).toEqual(['LOGIN_FALLIDO']);
  });

  it('el 5.º fallo bloquea la cuenta y lo audita (CUENTA_BLOQUEADA)', async () => {
    const { servicio, auditadas } = armar({ cuenta: cuentaBase({ intentos_fallidos: 4 }) });
    await expect(login(servicio, 'otra-clave-123')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
    expect(auditadas).toEqual(['LOGIN_FALLIDO', 'CUENTA_BLOQUEADA']);
  });

  it('correo inexistente → el MISMO 401 (no revela qué correos existen) y se audita', async () => {
    const { servicio, llamadas, auditadas } = armar({ cuenta: null });
    await expect(login(servicio)).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(llamadas).toEqual([]); // no hay contador que tocar
    expect(auditadas).toEqual(['LOGIN_FALLIDO']);
  });

  it('cuenta bloqueada → 423, aunque la clave sea correcta', async () => {
    const { servicio } = armar({
      cuenta: cuentaBase({ intentos_fallidos: 5, bloqueado_hasta: new Date(Date.now() + MIN) }),
    });
    await expect(login(servicio)).rejects.toMatchObject({ codigo: 'CUENTA_BLOQUEADA' });
  });

  it('cuenta suspendida → 403 CUENTA_SUSPENDIDA', async () => {
    const { servicio } = armar({ cuenta: cuentaBase({ estado_cuenta: 'SUSPENDIDA' }) });
    await expect(login(servicio)).rejects.toMatchObject({ codigo: 'CUENTA_SUSPENDIDA' });
  });

  it('cuenta sin verificar → 403 CUENTA_NO_VERIFICADA', async () => {
    const { servicio } = armar({ cuenta: cuentaBase({ verificado: false }) });
    await expect(login(servicio)).rejects.toMatchObject({ codigo: 'CUENTA_NO_VERIFICADA' });
  });

  it('cuenta eliminada con clave mala: no toca contadores, solo audita', async () => {
    const { servicio, llamadas, auditadas } = armar({
      cuenta: cuentaBase({ estado_cuenta: 'ELIMINADA' }),
    });
    await expect(login(servicio, 'otra-clave-123')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
    expect(llamadas).toEqual([]);
    expect(auditadas).toEqual(['LOGIN_FALLIDO']);
  });
});

describe('AuthService.recuperar y restablecer (RF-04)', () => {
  const pedir = (s: AuthService) => s.recuperar({ correo: 'ana@udistrital.edu.co' });

  it('cuenta activa: guarda un token de recuperación y envía el correo', async () => {
    const { servicio, llamadas, correos } = armar();
    const res = await pedir(servicio);
    expect(llamadas).toEqual(['guardarToken:RECUPERACION']);
    expect(correos).toHaveLength(1);
    expect(res.mensaje).toContain('Si el correo está registrado');
  });

  it.each([
    ['no existe', null],
    ['está suspendida', cuentaBase({ estado_cuenta: 'SUSPENDIDA' })],
  ])('si la cuenta %s: misma respuesta, sin token ni correo', async (_caso, cuenta) => {
    const { servicio, llamadas, correos } = armar({ cuenta });
    const res = await pedir(servicio);
    expect(res.mensaje).toContain('Si el correo está registrado');
    expect(llamadas).toEqual([]);
    expect(correos).toHaveLength(0);
  });

  it('restablecer: usa el token, cambia la clave, invalida los otros enlaces y audita', async () => {
    const { servicio, llamadas, auditadas } = armar({ token: tokenBd({ tipo: 'RECUPERACION' }) });
    await servicio.restablecer({ token: 'x', contrasena: 'nueva-clave-456' });
    expect(llamadas).toEqual([
      'marcarTokenUsado',
      'cambiarContrasena',
      'invalidarTokens:RECUPERACION',
    ]);
    expect(auditadas).toEqual(['CONTRASENA_RESTABLECIDA']);
  });

  it('un token de VERIFICACIÓN no sirve para restablecer', async () => {
    const { servicio, llamadas } = armar({ token: tokenBd({ tipo: 'VERIFICACION' }) });
    await expect(
      servicio.restablecer({ token: 'x', contrasena: 'nueva-clave-456' }),
    ).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    expect(llamadas).not.toContain('cambiarContrasena');
  });
});

describe('AuthService.reenviarVerificacion (freno de 2 minutos)', () => {
  const reenviar = (s: AuthService) => s.reenviarVerificacion({ correo: 'ana@udistrital.edu.co' });
  const sinVerificar = cuentaBase({ verificado: false });

  it('sin enlace reciente: invalida el anterior, guarda uno nuevo y envía el correo', async () => {
    const { servicio, llamadas, correos } = armar({
      cuenta: sinVerificar,
      ultimoToken: new Date(Date.now() - 5 * MIN),
    });
    await reenviar(servicio);
    expect(llamadas).toEqual(['invalidarTokens:VERIFICACION', 'guardarToken:VERIFICACION']);
    expect(correos).toHaveLength(1);
  });

  it('el último enlace se mandó hace 1 minuto: no manda otro (misma respuesta)', async () => {
    const { servicio, llamadas, correos } = armar({
      cuenta: sinVerificar,
      ultimoToken: new Date(Date.now() - MIN),
    });
    const res = await reenviar(servicio);
    expect(res.mensaje).toContain('te enviamos un nuevo enlace');
    expect(llamadas).toEqual([]);
    expect(correos).toHaveLength(0);
  });

  it.each([
    ['ya está verificada', cuentaBase()],
    ['no existe', null],
    ['está suspendida', cuentaBase({ verificado: false, estado_cuenta: 'SUSPENDIDA' })],
  ])('si la cuenta %s: misma respuesta y nada más', async (_caso, cuenta) => {
    const { servicio, llamadas, correos } = armar({ cuenta });
    await reenviar(servicio);
    expect(llamadas).toEqual([]);
    expect(correos).toHaveLength(0);
  });
});

// El hash que busca el servicio es el SHA-256 del token en claro: nunca el token mismo.
it('tokenValido busca por el hash del token, no por el token en claro', async () => {
  const buscados: string[] = [];
  const { servicio } = armar({ token: tokenBd() });
  const repo = (servicio as unknown as { repo: { buscarToken: (h: string) => unknown } }).repo;
  const original = repo.buscarToken;
  repo.buscarToken = (h: string) => {
    buscados.push(h);
    return original(h);
  };
  await servicio.verificar('token-en-claro');
  expect(buscados).toEqual([hashToken('token-en-claro')]);
});
