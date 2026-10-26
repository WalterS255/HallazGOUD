import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CatalogosRepository, type DatosCategoria } from './catalogos.repository.js';

// Traduce los errores de la BD a respuestas claras. Los códigos de Prisma:
//   P2002 = choca con un UNIQUE (nombre de categoría o sede, edificio dentro de la sede)
//   P2003 = choca con una llave foránea (borrar una sede que tiene lugares, o un
//           lugar con publicaciones: la FK con RESTRICT lo impide)
//   P2025 = el registro que se quiere editar o borrar no existe
async function traducir<T>(trabajo: Promise<T>, que: string): Promise<T> {
  try {
    return await trabajo;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'NOMBRE_REPETIDO',
          `Ya existe ${que} con ese nombre.`,
        );
      }
      if (error.code === 'P2003') {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'EN_USO',
          `No se puede borrar: hay registros que usan ${que}.`,
        );
      }
      if (error.code === 'P2025') {
        throw new ErrorApp(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', `No existe ${que}.`);
      }
    }
    throw error;
  }
}

@Injectable()
export class CatalogosService {
  constructor(private readonly repo: CatalogosRepository) {}

  // GET /catalogos (público): lo que el formulario de publicar necesita.
  publico() {
    return this.repo.publico();
  }

  categorias() {
    return this.repo.categorias();
  }
  crearCategoria(d: DatosCategoria & { nombre: string }) {
    return traducir(this.repo.crearCategoria(d), 'una categoría');
  }
  // No hay "borrar categoría": las publicaciones la usan. Se desactiva (activa: false)
  // y deja de salir en el formulario, sin romper las publicaciones viejas.
  editarCategoria(id: number, d: DatosCategoria) {
    return traducir(this.repo.editarCategoria(id, d), 'esa categoría');
  }

  crearSede(nombre: string) {
    return traducir(this.repo.crearSede(nombre), 'una sede');
  }
  editarSede(id: number, nombre: string) {
    return traducir(this.repo.editarSede(id, nombre), 'esa sede');
  }
  async borrarSede(id: number): Promise<void> {
    await traducir(this.repo.borrarSede(id), 'esa sede');
  }

  crearLugar(d: { id_sede: number; edificio: string; referencia?: string | null }) {
    // P2003 aquí significa "la sede no existe": el mensaje genérico de EN_USO no aplica.
    return traducir(this.repo.crearLugar(d), 'un lugar').catch((e: unknown) => {
      if (e instanceof ErrorApp && e.codigo === 'EN_USO') {
        throw new ErrorApp(HttpStatus.BAD_REQUEST, 'SEDE_NO_EXISTE', 'La sede no existe.');
      }
      throw e;
    });
  }
  editarLugar(id: number, d: { edificio?: string; referencia?: string | null }) {
    return traducir(this.repo.editarLugar(id, d), 'ese lugar');
  }
  async borrarLugar(id: number): Promise<void> {
    await traducir(this.repo.borrarLugar(id), 'ese lugar');
  }
}
