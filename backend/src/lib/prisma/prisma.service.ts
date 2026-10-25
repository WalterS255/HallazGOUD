import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
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
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('Falta DATABASE_URL: cópiala de .env.example a tu .env.');
    }
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  // Al apagar la app (SIGTERM de Docker), se cierran las conexiones con calma.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
