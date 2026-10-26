import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../comun/autorizacion/roles.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaPeriodo, type PeriodoHttp } from './admin.schemas.js';
import { EstadisticasService } from './estadisticas.service.js';

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly estadisticas: EstadisticasService) {}

  // RF-30. Un PERIODO_INVALIDO (desde ≥ hasta) lo rechaza el servicio.
  @Get('estadisticas')
  obtener(@Query(new ValidacionZod(esquemaPeriodo)) periodo: PeriodoHttp) {
    return this.estadisticas.obtener(periodo);
  }
}
