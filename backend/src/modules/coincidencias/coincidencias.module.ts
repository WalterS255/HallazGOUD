import { Module } from '@nestjs/common';
import { CoincidenciasRepository } from './coincidencias.repository.js';
import { CoincidenciasService } from './coincidencias.service.js';

// Sin controlador todavía: GET /publicaciones/:id/coincidencias es solo para el
// autor y necesita la sesión (Fase D). Por ahora lo usan otros módulos (exports).
@Module({
  providers: [CoincidenciasRepository, CoincidenciasService],
  exports: [CoincidenciasService],
})
export class CoincidenciasModule {}
