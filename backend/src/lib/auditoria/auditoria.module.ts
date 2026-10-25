import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service.js';

// Global como PrismaModule: cualquier servicio puede pedir AuditoriaService.
@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
