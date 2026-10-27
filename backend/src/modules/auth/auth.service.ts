import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash, hashSync } from 'bcryptjs';
import { ErrorApp } from '../../comun/errores/error-app.js';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { config } from '../../config/configuracion.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { CorreoService } from '../../lib/correo/correo.service.js';
import { correoRecuperacion, correoVerificacion } from '../../lib/correo/plantillas.js';
import { AuthRepository } from './auth.repository.js';
import type {
  DatosLogin,
  DatosRecuperar,
  DatosRegistro,
  DatosRestablecer,
} from './auth.schemas.js';
import { decidirLogin, estaBloqueado, registrarExito, registrarFallo } from './bloqueo.js';
import { evaluarToken, generarToken, hashToken, type TipoToken } from './tokens.js';

// Si el correo NO existe, igual se compara la contraseña contra este hash falso.
// Así el login tarda lo mismo exista o no la cuenta, y nadie puede averiguar qué
// correos están registrados midiendo cuánto tarda la respuesta.
const HASH_FALSO = hashSync('contrasena-que-nadie-tiene', config.bcryptCoste);

// Mensaje único para "no existe" y "contraseña incorrecta" (regla 6.7).
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos.';

// Tiempo mínimo entre dos reenvíos del correo de activación a la misma cuenta.
const ESPERA_REENVIO_MS = 2 * 60 * 1000;

export interface Contexto {
  ip: string | null;
}

export interface Sesion {
  token: string;
  usuario: { id: number; nombre: string | null; rol: UsuarioSesion['rol'] };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly auditoria: AuditoriaService,
    private readonly correo: CorreoService,
    private readonly jwt: JwtService,
  ) {}

  // RF-01 + RF-02: crea la cuenta (sin verificar) y envía el enlace de activación.
  async registrar(datos: DatosRegistro, ctx: Contexto): Promise<{ mensaje: string }> {
    const ahora = new Date();
    const hash_contrasena = await hash(datos.contrasena, config.bcryptCoste); // RNF-06
    const token = generarToken('VERIFICACION', ahora);

    try {
      await this.repo.transaccion(async (tx) => {
        const { id } = await this.repo.crearUsuario(
          {
            nombre: datos.nombre,
            correo: datos.correo, // ya viene en minúsculas desde el esquema de Zod
            programa: datos.programa,
            hash_contrasena,
            acepto_politica_en: ahora, // Ley 1581: cuándo aceptó la política
          },
          tx,
        );
        await this.repo.guardarToken(id, 'VERIFICACION', token, tx);
        await this.auditoria.registrar(
          {
            accion: 'CUENTA_REGISTRADA',
            entidad: 'usuario',
            id_entidad: id,
            id_usuario: id,
            ip: ctx.ip,
          },
          tx,
        );
      });
    } catch (e) {
      // P2002 = Prisma avisando que se violó un índice único: el correo ya existe.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'CORREO_REGISTRADO',
          'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
        );
      }
      throw e;
    }

    // El correo se envía DESPUÉS de guardar (si fallara dentro de la transacción,
    // el usuario se perdería). Si el envío falla, la cuenta ya existe: se registra en
    // el log y la persona puede pedir otro enlace más adelante.
    await this.enviarSinRomper(correoVerificacion(datos.correo, datos.nombre, token.token));
    return { mensaje: 'Te enviamos un correo para activar tu cuenta.' };
  }

  // RF-02: el enlace del correo trae el token; si sirve, la cuenta queda verificada.
  async verificar(token: string): Promise<{ mensaje: string }> {
    const ahora = new Date();
    const encontrado = await this.tokenValido(token, 'VERIFICACION', ahora);
    await this.repo.transaccion(async (tx) => {
      await this.usarToken(encontrado.id, ahora, tx);
      await this.repo.marcarVerificado(encontrado.id_usuario, tx);
      await this.auditoria.registrar(
        {
          accion: 'CUENTA_VERIFICADA',
          entidad: 'usuario',
          id_entidad: encontrado.id_usuario,
          id_usuario: encontrado.id_usuario,
        },
        tx,
      );
    });
    return { mensaje: 'Tu cuenta quedó activada. Ya puedes iniciar sesión.' };
  }

  // RF-03 + regla 6.7: login con bloqueo por intentos.
  async login(datos: DatosLogin, ctx: Contexto): Promise<Sesion> {
    const ahora = new Date();
    const cuenta = await this.repo.buscarParaLogin(datos.correo);
    const bloqueada = cuenta ? estaBloqueado(this.intentos(cuenta), ahora) : false;

    // bcrypt se ejecuta SIEMPRE (con el hash falso si no hay cuenta), salvo cuando la
    // cuenta está bloqueada: ahí no se revisa la clave, para que el atacante no pueda
    // seguir probando contraseñas durante el bloqueo.
    const correcta = bloqueada
      ? false
      : await compare(datos.contrasena, cuenta?.hash_contrasena ?? HASH_FALSO);

    const resultado = decidirLogin(
      cuenta && {
        ...this.intentos(cuenta),
        verificado: cuenta.verificado,
        estadoCuenta: cuenta.estado_cuenta,
      },
      correcta,
      ahora,
    );

    switch (resultado) {
      case 'OK': {
        const c = cuenta!;
        if (c.intentos_fallidos > 0 || c.bloqueado_hasta) {
          await this.repo.guardarIntentos(c.id, registrarExito());
        }
        const sesion: UsuarioSesion = { id: c.id, rol: c.rol };
        // `sub` (subject) es el nombre estándar del campo "a quién pertenece el token".
        const token = await this.jwt.signAsync({ sub: sesion.id, rol: sesion.rol });
        return { token, usuario: { id: c.id, nombre: c.nombre, rol: c.rol } };
      }
      case 'BLOQUEADA':
        throw new ErrorApp(
          HttpStatus.LOCKED,
          'CUENTA_BLOQUEADA',
          'Tu cuenta está bloqueada por varios intentos fallidos. Intenta de nuevo en 15 minutos.',
        );
      case 'SUSPENDIDA':
        throw new ErrorApp(
          HttpStatus.FORBIDDEN,
          'CUENTA_SUSPENDIDA',
          'Tu cuenta está suspendida. Comunícate con la administración.',
        );
      case 'NO_VERIFICADA':
        throw new ErrorApp(
          HttpStatus.FORBIDDEN,
          'CUENTA_NO_VERIFICADA',
          'Primero activa tu cuenta con el enlace que te enviamos por correo.',
        );
      case 'CREDENCIALES_INVALIDAS':
        await this.registrarFallo(cuenta, ahora, ctx);
        throw new ErrorApp(
          HttpStatus.UNAUTHORIZED,
          'CREDENCIALES_INVALIDAS',
          CREDENCIALES_INVALIDAS,
        );
    }
  }

  // RF-04: SIEMPRE responde lo mismo, exista o no el correo (para no revelar cuáles
  // están registrados). Solo si la cuenta existe y está activa se envía el enlace.
  async recuperar(datos: DatosRecuperar): Promise<{ mensaje: string }> {
    const respuesta = {
      mensaje:
        'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.',
    };
    const cuenta = await this.repo.buscarParaLogin(datos.correo);
    if (!cuenta || cuenta.estado_cuenta !== 'ACTIVA') return respuesta;

    const token = generarToken('RECUPERACION');
    await this.repo.guardarToken(cuenta.id, 'RECUPERACION', token);
    await this.enviarSinRomper(correoRecuperacion(datos.correo, cuenta.nombre ?? '', token.token));
    return respuesta;
  }

  async restablecer(datos: DatosRestablecer): Promise<{ mensaje: string }> {
    const ahora = new Date();
    const encontrado = await this.tokenValido(datos.token, 'RECUPERACION', ahora);
    const nuevoHash = await hash(datos.contrasena, config.bcryptCoste);
    await this.repo.transaccion(async (tx) => {
      await this.usarToken(encontrado.id, ahora, tx);
      await this.repo.cambiarContrasena(encontrado.id_usuario, nuevoHash, tx);
      // Los otros enlaces de recuperación que la persona haya pedido dejan de servir.
      await this.repo.invalidarTokens(encontrado.id_usuario, 'RECUPERACION', ahora, tx);
      await this.auditoria.registrar(
        {
          accion: 'CONTRASENA_RESTABLECIDA',
          entidad: 'usuario',
          id_entidad: encontrado.id_usuario,
          id_usuario: encontrado.id_usuario,
        },
        tx,
      );
    });
    return { mensaje: 'Tu contraseña se cambió. Ya puedes iniciar sesión.' };
  }

  // RF-02: si el primer correo no llegó (o venció), pedir otro enlace de activación.
  // Igual que recuperar(): la respuesta es SIEMPRE la misma, exista o no la cuenta.
  async reenviarVerificacion(datos: DatosRecuperar): Promise<{ mensaje: string }> {
    const respuesta = {
      mensaje: 'Si tu cuenta existe y aún no está activada, te enviamos un nuevo enlace.',
    };
    const cuenta = await this.repo.buscarParaLogin(datos.correo);
    if (!cuenta || cuenta.verificado || cuenta.estado_cuenta !== 'ACTIVA') return respuesta;

    // Freno por CUENTA (el rate limit es por IP): si el último enlace se envió hace
    // menos de 2 minutos, no se manda otro. Así nadie usa este botón para llenar de
    // correos la bandeja de otra persona, aunque cambie de IP.
    const ahora = new Date();
    const ultimo = await this.repo.ultimoToken(cuenta.id, 'VERIFICACION');
    if (ultimo && ahora.getTime() - ultimo.getTime() < ESPERA_REENVIO_MS) return respuesta;

    const token = generarToken('VERIFICACION', ahora);
    await this.repo.transaccion(async (tx) => {
      // El enlace anterior deja de servir: solo vale el más reciente.
      await this.repo.invalidarTokens(cuenta.id, 'VERIFICACION', ahora, tx);
      await this.repo.guardarToken(cuenta.id, 'VERIFICACION', token, tx);
    });
    await this.enviarSinRomper(correoVerificacion(datos.correo, cuenta.nombre ?? '', token.token));
    return respuesta;
  }

  // --- piezas internas --------------------------------------------------------------

  private intentos(c: { intentos_fallidos: number; bloqueado_hasta: Date | null }) {
    return { intentosFallidos: c.intentos_fallidos, bloqueadoHasta: c.bloqueado_hasta };
  }

  private async registrarFallo(
    cuenta: Awaited<ReturnType<AuthRepository['buscarParaLogin']>>,
    ahora: Date,
    ctx: Contexto,
  ) {
    // Sin cuenta (o eliminada) no hay contador que actualizar; igual queda en la auditoría.
    if (!cuenta || cuenta.estado_cuenta === 'ELIMINADA') {
      await this.auditoria.registrar({ accion: 'LOGIN_FALLIDO', entidad: 'usuario', ip: ctx.ip });
      return;
    }
    const nuevo = registrarFallo(this.intentos(cuenta), ahora);
    const seBloqueo = estaBloqueado(nuevo, ahora);
    await this.repo.transaccion(async (tx) => {
      await this.repo.guardarIntentos(cuenta.id, nuevo, tx);
      await this.auditoria.registrar(
        { accion: 'LOGIN_FALLIDO', entidad: 'usuario', id_entidad: cuenta.id, ip: ctx.ip },
        tx,
      );
      if (seBloqueo) {
        await this.auditoria.registrar(
          {
            accion: 'CUENTA_BLOQUEADA',
            entidad: 'usuario',
            id_entidad: cuenta.id,
            ip: ctx.ip,
            detalle: { hasta: nuevo.bloqueadoHasta!.toISOString() },
          },
          tx,
        );
      }
    });
  }

  private async tokenValido(token: string, tipo: TipoToken, ahora: Date) {
    const encontrado = await this.repo.buscarToken(hashToken(token));
    // Un token de recuperación no sirve para verificar, ni al revés.
    if (!encontrado || encontrado.tipo !== tipo) {
      throw new ErrorApp(HttpStatus.BAD_REQUEST, 'TOKEN_INVALIDO', 'El enlace no es válido.');
    }
    const estado = evaluarToken(
      { expiraEn: encontrado.expira_en, usadoEn: encontrado.usado_en },
      ahora,
    );
    if (estado === 'USADO') {
      throw new ErrorApp(HttpStatus.BAD_REQUEST, 'TOKEN_USADO', 'Este enlace ya se usó.');
    }
    if (estado === 'EXPIRADO') {
      throw new ErrorApp(
        HttpStatus.BAD_REQUEST,
        'TOKEN_EXPIRADO',
        'Este enlace venció. Pide uno nuevo.',
      );
    }
    return encontrado;
  }

  private async usarToken(
    id: number,
    ahora: Date,
    tx: Parameters<AuthRepository['marcarVerificado']>[1],
  ) {
    // Si otra petición lo usó una fracción de segundo antes, aquí se detecta.
    if (!(await this.repo.marcarTokenUsado(id, ahora, tx))) {
      throw new ErrorApp(HttpStatus.BAD_REQUEST, 'TOKEN_USADO', 'Este enlace ya se usó.');
    }
  }

  private async enviarSinRomper(c: Parameters<CorreoService['enviar']>[0]) {
    try {
      await this.correo.enviar(c);
    } catch (e) {
      this.logger.error(`No se pudo enviar "${c.asunto}" a ${c.para}: ${(e as Error).message}`);
    }
  }
}
