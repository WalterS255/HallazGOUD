// Datos iniciales: catálogos (categorías, sedes, lugares) y un usuario de prueba por rol.
// Se ejecuta con `npm run db:seed`. Es idempotente: se puede correr varias veces
// sin duplicar nada, porque usa upsert (crear si no existe, actualizar si existe).
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

try {
  process.loadEnvFile('../.env');
} catch {
  // sin .env: se usan las variables del proceso
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// sensible = true → el formulario pide tapar datos personales (regla 6.6)
const categorias = [
  { nombre: 'Electrónicos', icono: 'laptop', sensible: false },
  { nombre: 'Documentos', icono: 'id-card', sensible: true },
  { nombre: 'Tarjetas', icono: 'credit-card', sensible: true },
  { nombre: 'Llaves', icono: 'key', sensible: true },
  { nombre: 'Ropa y accesorios', icono: 'shirt', sensible: false },
  { nombre: 'Útiles y libros', icono: 'book', sensible: false },
  { nombre: 'Termos y loncheras', icono: 'cup', sensible: false },
  { nombre: 'Otros', icono: 'box', sensible: false },
];

// Sedes de la Universidad Distrital con algunos lugares típicos de cada una.
const sedes: Record<string, string[]> = {
  'Calle 40 (Ingeniería)': [
    'Edificio Sabio Caldas',
    'Edificio Alejandro Suárez Copete',
    'Biblioteca',
    'Cafetería',
  ],
  'Macarena A': ['Bloque principal', 'Biblioteca', 'Cafetería'],
  'Macarena B': ['Bloque principal', 'Laboratorios'],
  'Tecnológica (Ciudad Bolívar)': ['Bloque de aulas', 'Laboratorios', 'Biblioteca', 'Cafetería'],
  'Vivero (Medio Ambiente)': ['Bloque de aulas', 'Laboratorios'],
  'El Porvenir (Bosa)': ['Bloque de aulas', 'Biblioteca', 'Cafetería'],
  'ASAB (Artes)': ['Salones de ensayo', 'Auditorio'],
  'Aduanilla de Paiba': ['Biblioteca central', 'Auditorio'],
};

// Contraseña de los usuarios de prueba: viene del .env (CONTRASENA_SEED), nunca del
// código (regla 5). Se guarda su hash bcrypt, como haría el registro real.
// Hash de relleno de versiones anteriores del seed: si una cuenta lo tiene, se reemplaza.
const HASH_PENDIENTE = 'PENDIENTE-FASE-D';
const contrasenaSeed = process.env.CONTRASENA_SEED;
if (!contrasenaSeed || contrasenaSeed.length < 8) {
  throw new Error(
    'Define CONTRASENA_SEED en el .env (mínimo 8 caracteres): es la contraseña de los usuarios de prueba.',
  );
}
const hashSeed = await hash(contrasenaSeed, Number(process.env.BCRYPT_COSTE ?? 12));

const usuarios = [
  {
    nombre: 'Usuaria de Prueba',
    correo: 'usuario.prueba@udistrital.edu.co',
    rol: 'USUARIO',
    programa: 'Ingeniería de Sistemas',
  },
  {
    nombre: 'Moderador de Prueba',
    correo: 'moderador.prueba@udistrital.edu.co',
    rol: 'MODERADOR',
    programa: 'Bienestar Institucional',
  },
  {
    nombre: 'Admin de Prueba',
    correo: 'admin.prueba@udistrital.edu.co',
    rol: 'ADMIN',
    programa: 'Oficina de Sistemas',
  },
] as const;

async function main() {
  for (const c of categorias) {
    await prisma.categoria.upsert({ where: { nombre: c.nombre }, update: c, create: c });
  }

  for (const [nombreSede, edificios] of Object.entries(sedes)) {
    const sede = await prisma.sede.upsert({
      where: { nombre: nombreSede },
      update: {},
      create: { nombre: nombreSede },
    });
    for (const edificio of edificios) {
      await prisma.lugar.upsert({
        where: { id_sede_edificio: { id_sede: sede.id, edificio } },
        update: {},
        create: { id_sede: sede.id, edificio },
      });
    }
  }

  // correo no lleva @unique en el schema (su índice único es sobre lower(correo),
  // ver CLAUDE.md §5.5), así que upsert no sirve: se busca con findFirst.
  for (const u of usuarios) {
    const existe = await prisma.usuario.findFirst({
      where: { correo: u.correo },
      select: { id: true, hash_contrasena: true },
    });
    if (!existe) {
      await prisma.usuario.create({
        data: {
          ...u,
          hash_contrasena: hashSeed,
          verificado: true,
          acepto_politica_en: new Date(),
        },
      });
    } else if (existe.hash_contrasena === HASH_PENDIENTE) {
      // Cuenta creada por un seed anterior: se le pone la contraseña real de prueba.
      await prisma.usuario.update({
        where: { id: existe.id },
        data: { hash_contrasena: hashSeed },
      });
    }
  }

  const [nCategorias, nSedes, nLugares, nUsuarios] = await Promise.all([
    prisma.categoria.count(),
    prisma.sede.count(),
    prisma.lugar.count(),
    prisma.usuario.count(),
  ]);
  console.log(
    `Seed listo: ${nCategorias} categorías, ${nSedes} sedes, ${nLugares} lugares, ${nUsuarios} usuarios.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
