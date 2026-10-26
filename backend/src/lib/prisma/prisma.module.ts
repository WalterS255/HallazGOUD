import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global: cualquier módulo puede pedir PrismaService sin importar este módulo
// en cada uno. Se registra una sola vez, en AppModule.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
