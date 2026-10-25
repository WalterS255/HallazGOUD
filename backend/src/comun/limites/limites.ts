import { Throttle, type ThrottlerModuleOptions } from '@nestjs/throttler';

// *Rate limit*: cuántas peticiones puede hacer una misma IP en una ventana de tiempo.
// Frena a quien intenta adivinar contraseñas probando miles por minuto, o a un
// programa que inunda la API. Al pasarse responde 429 (DEMASIADAS_SOLICITUDES)
// con el encabezado Retry-After: cuántos segundos esperar.
//
// Complementa el bloqueo por CUENTA de la regla 6.7 (5 fallos → 15 min, va con la BD):
// el rate limit frena por IP aunque el atacante cambie de correo en cada intento.

const UN_MINUTO = 60_000;

// Límite general para toda la API.
export const opcionesLimites: ThrottlerModuleOptions = [
  { name: 'default', ttl: UN_MINUTO, limit: 100 },
];

// Límite estricto para las rutas que un atacante querría probar a la fuerza:
// login, registro, recuperar contraseña. Uso:  @LimiteEstricto()  sobre el método.
export const LIMITE_ESTRICTO = { limit: 5, ttl: UN_MINUTO };
export const LimiteEstricto = () => Throttle({ default: LIMITE_ESTRICTO });

// OJO (Fase K): el límite se cuenta por `req.ip`. Detrás del proxy inverso, req.ip
// sería la IP del proxy y TODOS compartirían el mismo límite. En producción hay que
// activar app.set('trust proxy', 1) para que Express lea la IP real del encabezado
// X-Forwarded-For que pone el proxy. Sin proxy NO se activa: cualquiera podría
// falsificar ese encabezado y saltarse el límite.
//
// Los contadores viven en la memoria del proceso: sirve con UNA instancia del backend.
// Con varias (escalar), cada una contaría por su lado y habría que guardarlos en Redis.
