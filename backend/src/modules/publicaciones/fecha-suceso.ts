// Pregunta 13.7 (decidida 2026-11-21): el reloj del celular puede ir unos minutos
// adelantado. Si alguien reporta "ahora mismo", la fecha llega un poco en el futuro y el
// CHECK fecha_suceso <= fecha_creacion la rechazaría. Regla:
// - Hasta MARGEN_RELOJ_MS en el futuro: se toma como "ahora" (es el reloj, no la persona).
// - Más que eso: se rechaza (es un error real al elegir la fecha).
// Función pura: se prueba sin base de datos.

export const MARGEN_RELOJ_MS = 10 * 60_000; // 10 minutos

export function ajustarFechaSuceso(fecha: Date, ahora: Date): Date | null {
  const adelanto = fecha.getTime() - ahora.getTime();
  if (adelanto <= 0) return fecha;
  if (adelanto <= MARGEN_RELOJ_MS) return ahora;
  return null; // demasiado en el futuro
}
