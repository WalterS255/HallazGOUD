import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
// Sin estado (RNF-15): el servidor no guarda sesiones; todo lo necesario va firmado
// dentro del token. Consecuencia: si un admin suspende una cuenta, el token que esa
// persona ya tenía sigue sirviendo hasta que vence (JWT_EXPIRA_EN).
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const encabezado = req.headers.authorization;
    if (!encabezado) return true;

    const [tipo, token] = String(encabezado).split(' ');
    if (tipo !== 'Bearer' || !token) throw sesionInvalida();

    try {
      // verifyAsync revisa la FIRMA (que lo hayamos emitido nosotros, con JWT_SECRET)
      // y la fecha de vencimiento. Si alguien cambia "rol":"USUARIO" por "ADMIN"
      // dentro del token, la firma deja de coincidir y aquí falla.
      const datos = await this.jwt.verifyAsync<{ sub: unknown; rol: unknown }>(token);
      if (typeof datos.sub !== 'number' || !ROLES_VALIDOS.includes(datos.rol as Rol)) {
        throw new Error('contenido inesperado');
      }
      req.usuario = { id: datos.sub, rol: datos.rol as Rol };
      return true;
    } catch {
      throw sesionInvalida();
    }
  }
}

function sesionInvalida() {
  return new ErrorApp(
    HttpStatus.UNAUTHORIZED,
    'SESION_INVALIDA',
    'Tu sesión venció o no es válida. Inicia sesión de nuevo.',
  );
}

// @Autenticado(): cualquier persona con sesión, sin importar el rol.
export const Autenticado = () => Roles(...ROLES_VALIDOS);

// En un controlador:  perfil(@UsuarioActual() usuario: UsuarioSesion)
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioSesion | undefined =>
    contexto.switchToHttp().getRequest<PeticionConSesion>().usuario,
);
