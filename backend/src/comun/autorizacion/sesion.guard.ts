import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import { ErrorApp } from '../errores/error-app.js';
import { type Rol, Roles, type UsuarioSesion } from './roles.js';

const ROLES_VALIDOS: readonly Rol[] = ['USUARIO', 'MODERADOR', 'ADMIN'];

type PeticionConSesion = {
  headers: Record<string, string | string[] | undefined>;
  usuario?: UsuarioSesion;
};

// Guard GLOBAL de sesión. Se ejecuta ANTES que RolesGuard (ver el orden en app.module):
//   - Sin encabezado Authorization → pasa como visitante (req.usuario queda vacío).
//     Las rutas públicas (catálogo, login) funcionan así.
//   - Con "Bearer <token>" válido → deja { id, rol } en req.usuario.
//   - Con un token vencido, alterado o mal formado → 401. Mejor avisar que tratarlo
//     como visitante: el frontend sabe que debe pedir iniciar sesión otra vez.
// Quién NECESITA sesión lo decide @Autenticado() / @Roles(...), que lee RolesGuard.
//
// Sin estado (RNF-15): el servidor no guarda sesiones en memoria; el token va firmado.
// PERO (decisión 2026-11-21): en cada petición con token se consulta la cuenta en la BD.
// Así una suspensión corta el acceso AL INSTANTE (antes, el token seguía sirviendo
// hasta vencer, hasta 1 día) y un cambio de rol aplica en la siguiente petición: el rol
// sale de la BD, no del token. Costo: una consulta por id (llave primaria), ~1 ms.
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const encabezado = req.headers.authorization;
    if (!encabezado) return true;

    const [tipo, token] = String(encabezado).split(' ');
    if (tipo !== 'Bearer' || !token) throw sesionInvalida();

    let id: number;
    try {
      // verifyAsync revisa la FIRMA (que lo hayamos emitido nosotros, con JWT_SECRET)
      // y la fecha de vencimiento. Si alguien cambia "rol":"USUARIO" por "ADMIN"
      // dentro del token, la firma deja de coincidir y aquí falla.
      const datos = await this.jwt.verifyAsync<{ sub: unknown; rol: unknown }>(token);
      if (typeof datos.sub !== 'number' || !ROLES_VALIDOS.includes(datos.rol as Rol)) {
        throw new Error('contenido inesperado');
      }
      id = datos.sub;
    } catch {
      throw sesionInvalida();
    }

    // Lista cerrada de campos (§6.3): de la cuenta solo se lee el estado y el rol.
    const cuenta = await this.prisma.usuario.findUnique({
      where: { id },
      select: { estado_cuenta: true, rol: true },
    });
    if (cuenta?.estado_cuenta === 'SUSPENDIDA') throw cuentaSuspendida();
    // Borrada (anonimizada) o inexistente: el token ya no representa a nadie.
    if (!cuenta || cuenta.estado_cuenta !== 'ACTIVA') throw sesionInvalida();

    req.usuario = { id, rol: cuenta.rol };
    return true;
  }
}

function sesionInvalida() {
  return new ErrorApp(
    HttpStatus.UNAUTHORIZED,
    'SESION_INVALIDA',
    'Tu sesión venció o no es válida. Inicia sesión de nuevo.',
  );
}

// 401 (no 403): el frontend borra la cookie al recibir un 401 y la persona sale.
function cuentaSuspendida() {
  return new ErrorApp(
    HttpStatus.UNAUTHORIZED,
    'CUENTA_SUSPENDIDA',
    'Tu cuenta está suspendida. Comunícate con la administración.',
  );
}

// @Autenticado(): cualquier persona con sesión, sin importar el rol.
export const Autenticado = () => Roles(...ROLES_VALIDOS);

// En un controlador:  perfil(@UsuarioActual() usuario: UsuarioSesion)
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioSesion | undefined =>
    contexto.switchToHttp().getRequest<PeticionConSesion>().usuario,
);
