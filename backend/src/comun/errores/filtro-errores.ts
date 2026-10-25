import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DetalleError, ErrorApp } from './error-app.js';

// Todas las respuestas de error de la API tienen la misma forma (sección 8):
//   { "error": { "codigo": "NO_ENCONTRADO", "mensaje": "..." } }
// Los errores de validación agregan `detalles`: un elemento por cada campo con problemas.
export interface CuerpoError {
  error: { codigo: string; mensaje: string; detalles?: DetalleError[] };
}

// Código y mensaje por defecto para cada estado HTTP, cuando el error no trae uno propio.
const POR_ESTADO: Record<number, { codigo: string; mensaje: string }> = {
  400: { codigo: 'SOLICITUD_INVALIDA', mensaje: 'La solicitud no es válida.' },
  401: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión.' },
  403: { codigo: 'PROHIBIDO', mensaje: 'No tienes permiso para hacer esto.' },
  404: { codigo: 'NO_ENCONTRADO', mensaje: 'El recurso no existe.' },
  409: { codigo: 'CONFLICTO', mensaje: 'La operación choca con el estado actual.' },
  413: { codigo: 'DEMASIADO_GRANDE', mensaje: 'El contenido enviado es demasiado grande.' },
  429: { codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiados intentos. Espera un momento.' },
};
const ERROR_INTERNO = {
  codigo: 'ERROR_INTERNO',
  mensaje: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
};

// @Catch() sin argumentos = atrapa TODO: errores de Nest, los nuestros y los inesperados.
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { estado, cuerpo } = this.traducir(excepcion);

    if (estado >= 500) {
      // Al log va el error completo (con la traza) para poder depurarlo;
      // al usuario solo el mensaje genérico: nunca se le muestran detalles internos.
      this.logger.error(excepcion);
    }
    res.status(estado).json(cuerpo);
  }

  traducir(excepcion: unknown): { estado: number; cuerpo: CuerpoError } {
    if (excepcion instanceof ErrorApp) {
      return {
        estado: excepcion.getStatus(),
        cuerpo: { error: excepcion.getResponse() as CuerpoError['error'] },
      };
    }

    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      const base = POR_ESTADO[estado] ?? (estado >= 500 ? ERROR_INTERNO : POR_ESTADO[400]);
      return { estado, cuerpo: { error: { ...base } } };
    }

    // Errores del lector de JSON de Express (JSON mal escrito, cuerpo muy grande).
    // No son HttpException, pero traen su estado en `status` y no son culpa del servidor.
    const estadoExpress = (excepcion as { status?: unknown })?.status;
    if (typeof estadoExpress === 'number' && estadoExpress >= 400 && estadoExpress < 500) {
      return {
        estado: estadoExpress,
        cuerpo: { error: { ...(POR_ESTADO[estadoExpress] ?? POR_ESTADO[400]) } },
      };
    }

    // Cualquier otra cosa es un error de programación: 500 genérico.
    return { estado: HttpStatus.INTERNAL_SERVER_ERROR, cuerpo: { error: { ...ERROR_INTERNO } } };
  }
}
