// Lee las variables de entorno UNA vez y las expone ya convertidas.
// El resto del código importa `config` y nunca toca process.env directamente:
// así, si falta una variable, falla al arrancar y no a mitad de una petición.
// (En la Fase D esto se valida con un esquema de Zod.)

function leerPuerto(valor, porDefecto) {
  const puerto = Number(valor ?? porDefecto);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(`PUERTO inválido: "${valor}". Debe ser un número entre 1 y 65535.`);
  }
  return puerto;
}

export const config = Object.freeze({
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: leerPuerto(process.env.PUERTO, 3000),
});
