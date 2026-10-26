import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../../config/configuracion.js';
import { PrismaClient } from '../../generated/prisma/client.js';

// El cliente de Prisma como "provider" de Nest: una sola instancia (y un solo
// grupo de conexiones) para toda la app. Los repositorios lo reciben por el
// constructor (inyección de dependencias) y nunca hacen `new PrismaClient()`.
//
// Prisma 7 necesita un "adaptador": la pieza que habla con PostgreSQL por debajo
// (aquí, el driver `pg` de Node). La conexión se abre en la primera consulta,
// así que la app arranca aunque la BD esté caída; /api/salud/bd lo detecta.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // La URL ya viene validada por config/configuracion.ts: si faltara, el servidor
    // ni siquiera habría arrancado.
    super({ adapter: new PrismaPg({ connectionString: config.baseDatos.url }) });
  }

  // Al apagar la app (SIGTERM de Docker), se cierran las conexiones con calma.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
