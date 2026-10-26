import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';

export interface DatosCategoria {
  nombre?: string;
  icono?: string | null;
  sensible?: boolean;
  activa?: boolean;
}

// Catálogos (RF-28). Los errores de Prisma (nombre repetido, en uso, no existe) los
// traduce el servicio; aquí solo se lee y se escribe.
@Injectable()
export class CatalogosRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Lo que necesita el formulario de publicar: solo categorías ACTIVAS.
  async publico() {
    const [categorias, sedes] = await this.prisma.$transaction([
      this.prisma.categoria.findMany({
        where: { activa: true },
        select: { id: true, nombre: true, icono: true, sensible: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.sede.findMany({
        select: {
          id: true,
          nombre: true,
          lugares: {
            select: { id: true, edificio: true, referencia: true },
            orderBy: { edificio: 'asc' },
          },
        },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return { categorias, sedes };
  }

  categorias() {
    return this.prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });
  }
  crearCategoria(d: Required<Pick<DatosCategoria, 'nombre'>> & DatosCategoria) {
    return this.prisma.categoria.create({ data: d });
  }
  editarCategoria(id: number, d: DatosCategoria) {
    return this.prisma.categoria.update({ where: { id }, data: d });
  }

  crearSede(nombre: string) {
    return this.prisma.sede.create({ data: { nombre } });
  }
  editarSede(id: number, nombre: string) {
    return this.prisma.sede.update({ where: { id }, data: { nombre } });
  }
  borrarSede(id: number) {
    return this.prisma.sede.delete({ where: { id } });
  }

  crearLugar(d: { id_sede: number; edificio: string; referencia?: string | null }) {
    return this.prisma.lugar.create({ data: d });
  }
  editarLugar(id: number, d: { edificio?: string; referencia?: string | null }) {
    return this.prisma.lugar.update({ where: { id }, data: d });
  }
  borrarLugar(id: number) {
    return this.prisma.lugar.delete({ where: { id } });
  }
}
