import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import {
  type Conteo,
  EstadisticasRepository,
  type Periodo,
  type PorMes,
  type Recuperacion,
} from './estadisticas.repository.js';

export interface Estadisticas {
  periodo: Periodo;
  por_mes: PorMes[];
  recuperacion: Recuperacion;
  categorias_frecuentes: Conteo[];
  lugares_criticos: Conteo[];
}

const UN_ANIO_MS = 365 * 86_400_000;

@Injectable()
export class EstadisticasService {
  constructor(private readonly repo: EstadisticasRepository) {}

  // GET /admin/estadisticas (RF-30). Sin fechas: los últimos 12 meses.
  // `ahora` es parámetro para que las pruebas no dependan del día en que corren.
  async obtener(p: Partial<Periodo> = {}, ahora = new Date()): Promise<Estadisticas> {
    const hasta = p.hasta ?? ahora;
    const desde = p.desde ?? new Date(hasta.getTime() - UN_ANIO_MS);
    if (desde >= hasta) {
      throw new ErrorApp(
        HttpStatus.BAD_REQUEST,
        'PERIODO_INVALIDO',
        'La fecha inicial debe ser anterior a la final.',
      );
    }
    const periodo = { desde, hasta };
    // Las cuatro consultas son independientes: van en paralelo.
    const [por_mes, recuperacion, categorias_frecuentes, lugares_criticos] = await Promise.all([
      this.repo.porMes(periodo),
      this.repo.recuperacion(periodo),
      this.repo.categoriasFrecuentes(periodo),
      this.repo.lugaresCriticos(periodo),
    ]);
    return { periodo, por_mes, recuperacion, categorias_frecuentes, lugares_criticos };
  }
}
