// Política de acceso del login (regla 6.7), como funciones PURAS: reciben datos y
// devuelven una decisión, sin tocar la BD ni el reloj. Así se prueban todos los
// casos límite (el 5.º intento, el minuto 15) sin esperar 15 minutos de verdad.
// El servicio de auth las usa y luego guarda el resultado en `usuario`.

export const MAX_INTENTOS = 5;
export const DURACION_BLOQUEO_MS = 15 * 60 * 1000;

// Lo que se guarda en la tabla usuario (columnas intentos_fallidos y bloqueado_hasta).
export interface EstadoIntentos {
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

export function estaBloqueado(e: EstadoIntentos, ahora: Date): boolean {
  return e.bloqueadoHasta !== null && e.bloqueadoHasta.getTime() > ahora.getTime();
}

// Contraseña incorrecta: suma un fallo y, al llegar a 5, bloquea 15 minutos.
export function registrarFallo(e: EstadoIntentos, ahora: Date): EstadoIntentos {
  // Si había un bloqueo que ya venció, se empieza a contar de cero. Si no, el primer
  // fallo después del bloqueo volvería a bloquear 15 minutos más.
  const anteriores = e.bloqueadoHasta && !estaBloqueado(e, ahora) ? 0 : e.intentosFallidos;
  const intentos = anteriores + 1;
  if (intentos >= MAX_INTENTOS) {
    return {
      intentosFallidos: 0,
      bloqueadoHasta: new Date(ahora.getTime() + DURACION_BLOQUEO_MS),
    };
  }
  return { intentosFallidos: intentos, bloqueadoHasta: e.bloqueadoHasta };
}

// Login correcto: el contador vuelve a cero.
export function registrarExito(): EstadoIntentos {
  return { intentosFallidos: 0, bloqueadoHasta: null };
}

// ---------------------------------------------------------------------------------
// Decisión completa del login, en el ORDEN en que debe revisarse.
// ---------------------------------------------------------------------------------
export interface CuentaParaLogin extends EstadoIntentos {
  verificado: boolean;
  estadoCuenta: 'ACTIVA' | 'SUSPENDIDA' | 'ELIMINADA';
}

export type ResultadoLogin =
  | 'OK'
  | 'CREDENCIALES_INVALIDAS' // mismo mensaje si el correo no existe o la clave está mal
  | 'BLOQUEADA'
  | 'NO_VERIFICADA'
  | 'SUSPENDIDA';

// `contrasenaCorrecta` la calcula el servicio con bcrypt ANTES de llamar aquí
// (si la cuenta no existe, igual se compara contra un hash falso: ver auth.service).
export function decidirLogin(
  cuenta: CuentaParaLogin | null,
  contrasenaCorrecta: boolean,
  ahora: Date,
): ResultadoLogin {
  // 1) Sin cuenta, o eliminada: idéntico a una contraseña mala, para no revelar
  //    qué correos están registrados.
  if (!cuenta || cuenta.estadoCuenta === 'ELIMINADA') return 'CREDENCIALES_INVALIDAS';
  // 2) Bloqueada: se rechaza AUNQUE la contraseña sea correcta; si no, el atacante
  //    seguiría probando y sabría cuándo acierta.
  if (estaBloqueado(cuenta, ahora)) return 'BLOQUEADA';
  // 3) Contraseña.
  if (!contrasenaCorrecta) return 'CREDENCIALES_INVALIDAS';
  // 4) Solo quien ya demostró saber la contraseña se entera de estos estados.
  if (cuenta.estadoCuenta === 'SUSPENDIDA') return 'SUSPENDIDA';
  if (!cuenta.verificado) return 'NO_VERIFICADA';
  return 'OK';
}
