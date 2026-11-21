import { Throttle, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { config } from '../../config/configuracion.js';

// *Rate limit*: cuántas peticiones puede hacer una misma IP en una ventana de tiempo.
// Frena a quien intenta adivinar contraseñas probando miles por minuto, o a un
// programa que inunda la API. Al pasarse responde 429 (DEMASIADAS_SOLICITUDES)
// con el encabezado Retry-After: cuántos segundos esperar.
//
// Complementa el bloqueo por CUENTA de la regla 6.7 (5 fallos → 15 min, va con la BD):
// el rate limit frena por IP aunque el atacante cambie de correo en cada intento.

const UN_MINUTO = 60_000;

// Límite general para toda la API.
export const opcionesLimites: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: UN_MINUTO, limit: 100 }],
  // Solo la prueba de carga lo apaga (SIN_LIMITE_PETICIONES; prohibido en producción).
  skipIf: () => config.sinLimitePeticiones,
};

// Límite estricto para las rutas que un atacante querría probar a la fuerza:
// login, registro, recuperar contraseña. Uso:  @LimiteEstricto()  sobre el método.
export const LIMITE_ESTRICTO = { limit: 5, ttl: UN_MINUTO };
export const LimiteEstricto = () => Throttle({ default: LIMITE_ESTRICTO });

// El límite se cuenta por `req.ip`. Todo pasa por el servidor de Next.js, así que sin
// más, req.ip sería la de Next y TODOS compartirían el mismo límite. Por eso:
// - Backend: TRUST_PROXY=1 → Express toma la IP del X-Forwarded-For que pone Next
//   (configurar-app.ts).
// - Frontend: Next NUNCA reenvía el X-Forwarded-For del navegador tal cual (se puede
//   inventar). Solo con CONFIAR_PROXY=true (hay un proxy inverso delante) reenvía la
//   última entrada, la que puso ese proxy (frontend/src/lib/ip-cliente.ts).
// Probado: inventando una IP distinta en cada intento, el 6.º login igual da 429
// (test/limites.e2e-spec.ts).
//
// Los contadores viven en la memoria del proceso: sirve con UNA instancia del backend.
// Con varias (escalar), cada una contaría por su lado y habría que guardarlos en Redis.
