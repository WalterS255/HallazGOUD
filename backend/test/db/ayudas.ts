// Utilidades compartidas por las pruebas de BD: cliente conectado a la base de pruebas
// y "fábricas" que crean filas válidas con valores únicos, para que cada prueba
// arme solo lo que necesita sin chocar con las demás.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { esUrlDePruebas } from './preparar-bd-test.js';

export function clienteTest(): PrismaClient {
  // globalSetup ya dejó en DATABASE_URL la base de ESTA corrida (los procesos de
  // prueba la heredan). Si por algún error apuntara a otra base, se aborta: unas
  // pruebas que crean y borran datos jamás deben correr contra hallazgo_ud.
  const url = process.env.DATABASE_URL ?? '';
  if (!esUrlDePruebas(url)) {
    throw new Error(
      `Las pruebas de BD solo corren contra hallazgo_test_*: ${new URL(url).pathname}`,
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

let contador = 0;
export const unico = (prefijo: string): string => `${prefijo}${Date.now()}${++contador}`;

export async function crearUsuario(prisma: PrismaClient, datos: { correo?: string } = {}) {
  return prisma.usuario.create({
    data: {
      nombre: 'Persona de Prueba',
      correo: datos.correo ?? `${unico('u')}@udistrital.edu.co`,
      hash_contrasena: 'hash-de-prueba',
      acepto_politica_en: new Date(),
    },
  });
}

export async function crearLugar(prisma: PrismaClient) {
  const sede = await prisma.sede.create({ data: { nombre: unico('Sede ') } });
  return prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Edificio A' } });
}

export async function crearPublicacion(
  prisma: PrismaClient,
  datos: {
    tipo: 'PERDIDO' | 'ENCONTRADO';
    id_usuario?: number;
    titulo?: string;
    descripcion?: string;
  },
) {
  const autor = datos.id_usuario ?? (await crearUsuario(prisma)).id;
  const lugar = await crearLugar(prisma);
  const categoria = await prisma.categoria.create({ data: { nombre: unico('Cat ') } });
  return prisma.publicacion.create({
    data: {
      id_usuario: autor,
      id_categoria: categoria.id,
      id_lugar: lugar.id,
      tipo: datos.tipo,
      titulo: datos.titulo ?? 'Objeto de prueba',
      descripcion: datos.descripcion ?? 'Descripción de prueba',
      fecha_suceso: new Date(Date.now() - 60_000),
    },
  });
}

// `fecha` (por defecto la pone PostgreSQL con SU reloj) y `fecha_resolucion` se
// comparan en un CHECK. Si una sale del reloj de Node y la otra del de la BD, un
// desfase de milisegundos entre ambos relojes basta para violar el CHECK.
// Regla: dos fechas que se comparan entre sí deben salir del MISMO reloj.
export function resueltaAhora(): { fecha: Date; fecha_resolucion: Date } {
  const ahora = new Date();
  return { fecha: ahora, fecha_resolucion: ahora };
}
