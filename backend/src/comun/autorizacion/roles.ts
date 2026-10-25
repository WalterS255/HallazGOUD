import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorApp } from '../errores/error-app.js';

// Mismos valores que el enum rol_usuario de la BD. Solo hay 3 roles fijos (sección 2):
// "autor de hallazgo" y "autor de pérdida" NO son roles, se deducen en cada servicio.
export type Rol = 'USUARIO' | 'MODERADOR' | 'ADMIN';

// Lo que el guard de sesión (Fase D, con JWT) dejará en req.usuario después de
// verificar el token. Solo datos públicos: nunca el correo ni el hash.
export interface UsuarioSesion {
  id: number;
  rol: Rol;
}

const CLAVE_ROLES = 'roles';

// Uso:  @Roles('ADMIN')  o  @Roles('MODERADOR', 'ADMIN')  sobre un controlador o método.
// SetMetadata solo "pega una etiqueta" a la ruta; quien la lee es RolesGuard.
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

// Un *guard* decide si la petición puede llegar al controlador.
// Este revisa que el rol del usuario esté entre los que pide @Roles(...).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    // Las etiquetas del método ganan sobre las del controlador.
    const permitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!permitidos || permitidos.length === 0) return true; // la ruta no pide rol

    const usuario = contexto.switchToHttp().getRequest<{ usuario?: UsuarioSesion }>().usuario;
    if (!usuario) {
      // Pide rol pero nadie inició sesión: 401 (falta identificarse), no 403.
      throw new ErrorApp(HttpStatus.UNAUTHORIZED, 'NO_AUTENTICADO', 'Debes iniciar sesión.');
    }
    if (!permitidos.includes(usuario.rol)) {
      // Se sabe quién es, pero no tiene permiso: 403.
      throw new ErrorApp(HttpStatus.FORBIDDEN, 'PROHIBIDO', 'No tienes permiso para hacer esto.');
    }
    return true;
  }
}
