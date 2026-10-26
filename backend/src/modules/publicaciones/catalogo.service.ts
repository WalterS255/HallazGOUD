import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import {
  CatalogoRepository,
  type DetallePublicacion,
  type FiltrosCatalogo,
  type ItemCatalogo,
} from './catalogo.repository.js';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 50; // §8: ?limite=… nunca más de 50

export type ParametrosCatalogo = Omit<FiltrosCatalogo, 'limite' | 'desplazamiento' | 'orden'> & {
  orden?: FiltrosCatalogo['orden'];
  pagina?: number;
  limite?: number;
};

export interface PaginaCatalogo {
  datos: ItemCatalogo[];
  total: number;
  pagina: number;
  limite: number;
}

@Injectable()
export class CatalogoService {
  constructor(private readonly repo: CatalogoRepository) {}

  // GET /publicaciones (§8). El controlador validará los parámetros con Zod;
  // aquí igual se acotan, por si otro módulo llama al servicio con valores raros.
  async listar(p: ParametrosCatalogo): Promise<PaginaCatalogo> {
    const limite = Math.min(Math.max(Math.trunc(p.limite ?? LIMITE_POR_DEFECTO), 1), LIMITE_MAXIMO);
    const pagina = Math.max(Math.trunc(p.pagina ?? 1), 1);
    const q = p.q?.trim() || undefined; // "   " no es una búsqueda

    const { items, total } = await this.repo.buscar({
      ...p,
      q,
      orden: p.orden ?? (q ? 'relevancia' : 'recientes'),
      limite,
      desplazamiento: (pagina - 1) * limite,
    });
    return { datos: items, total, pagina, limite };
  }

  // GET /publicaciones/:id (§8): sin detalle reservado ni datos de contacto.
  async detalle(id: number): Promise<DetallePublicacion> {
    const publicacion = await this.repo.detalle(id);
    if (!publicacion) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'PUBLICACION_NO_ENCONTRADA',
        'La publicación no existe.',
      );
    }
    return publicacion;
  }
}
