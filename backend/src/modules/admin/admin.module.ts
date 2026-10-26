import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import {
  CatalogosAdminController,
  CatalogosPublicosController,
  UsuariosAdminController,
} from './catalogos.controller.js';
import { CatalogosRepository } from './catalogos.repository.js';
import { CatalogosService } from './catalogos.service.js';
import { EstadisticasRepository } from './estadisticas.repository.js';
import { EstadisticasService } from './estadisticas.service.js';
import { UsuariosAdminRepository, UsuariosAdminService } from './usuarios-admin.service.js';

// Panel del administrador: catálogos (RF-28), cuentas (RF-29) y estadísticas (RF-30).
// Los reportes y la moderación (RF-26, RF-27) están en modules/moderacion/.
@Module({
  controllers: [
    AdminController,
    CatalogosPublicosController,
    CatalogosAdminController,
    UsuariosAdminController,
  ],
  providers: [
    EstadisticasRepository,
    EstadisticasService,
    CatalogosRepository,
    CatalogosService,
    UsuariosAdminRepository,
    UsuariosAdminService,
  ],
  exports: [EstadisticasService],
})
export class AdminModule {}
