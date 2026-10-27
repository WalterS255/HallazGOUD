import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { config } from '../../config/configuracion.js';
import { AuthController, FotosPerfilController, UsuariosController } from './auth.controller.js';
import { PerfilService } from './perfil.service.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    // global: true → SesionGuard (registrado en app.module) también recibe JwtService.
    JwtModule.register({
      global: true,
      secret: config.jwt.secreto,
      signOptions: {
        // El esquema de Zod ya garantizó el formato (15m, 12h, 1d…).
        expiresIn: config.jwt.expiraEn as `${number}${'s' | 'm' | 'h' | 'd'}`,
        algorithm: 'HS256',
      },
      // Solo se acepta HS256: evita el truco de mandar un token con "alg": "none".
      verifyOptions: { algorithms: ['HS256'] },
    }),
  ],
  controllers: [AuthController, UsuariosController, FotosPerfilController],
  providers: [AuthService, AuthRepository, PerfilService],
})
export class AuthModule {}
