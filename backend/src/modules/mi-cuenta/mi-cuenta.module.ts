import { Module } from '@nestjs/common';
import { MiCuentaController } from './mi-cuenta.controller.js';
import { MiCuentaRepository } from './mi-cuenta.repository.js';
import { MiCuentaService } from './mi-cuenta.service.js';

// GET /usuarios/me/publicaciones, /reclamaciones y /conversaciones: las listas de "lo mío".
@Module({
  controllers: [MiCuentaController],
  providers: [MiCuentaRepository, MiCuentaService],
})
export class MiCuentaModule {}
