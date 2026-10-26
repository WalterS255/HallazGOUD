import { Global, Module } from '@nestjs/common';
import { CorreoService } from './correo.service.js';

// @Global: cualquier módulo (auth, notificaciones…) recibe CorreoService sin importarlo.
@Global()
@Module({
  providers: [CorreoService],
  exports: [CorreoService],
})
export class CorreoModule {}
