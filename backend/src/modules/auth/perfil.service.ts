import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { AlmacenamientoService } from '../../lib/almacenamiento/almacenamiento.service.js';
import { procesarAvatar } from '../../lib/imagenes/procesar.js';
import { AuthRepository } from './auth.repository.js';
import type { DatosEditarPerfil } from './auth.schemas.js';

// La foto vive en el mismo bucket privado que las de publicaciones y se sirve por
// el backend (GET /api/imagenes/usuarios/…).
const PREFIJO_URL = '/api/imagenes/';
const CLAVE_VALIDA = /^usuarios\/(\d+)\/[0-9a-f-]{36}\.webp$/;

// RF-05: el perfil de la propia persona (datos básicos, foto y preferencias).
@Injectable()
export class PerfilService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async ver(id: number) {
    const p = await this.repo.perfil(id);
    if (!p)
      throw new ErrorApp(HttpStatus.NOT_FOUND, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    return p;
  }

  async editar(id: number, datos: DatosEditarPerfil) {
    await this.repo.actualizarPerfil(id, datos);
    return this.ver(id);
  }

  async cambiarFoto(id: number, archivo: { buffer: Buffer; originalname: string } | undefined) {
    if (!archivo) {
      throw new ErrorApp(
        HttpStatus.BAD_REQUEST,
        'SIN_IMAGENES',
        'Adjunta una foto en el campo "foto".',
      );
    }
    const contenido = await procesarAvatar(archivo.buffer, archivo.originalname);
    const anterior = await this.repo.fotoDe(id);

    const clave = `usuarios/${id}/${randomUUID()}.webp`;
    await this.almacenamiento.subir(clave, contenido, 'image/webp');
    try {
      await this.repo.guardarFoto(id, `${PREFIJO_URL}${clave}`);
    } catch (e) {
      await this.almacenamiento.borrarSinRomper(clave); // no dejar la foto nueva huérfana
      throw e;
    }
    // La foto anterior se borra solo después de guardar la nueva en la BD.
    if (anterior) await this.almacenamiento.borrarSinRomper(anterior.slice(PREFIJO_URL.length));
    return this.ver(id);
  }

  async quitarFoto(id: number) {
    const anterior = await this.repo.fotoDe(id);
    if (anterior) {
      await this.repo.guardarFoto(id, null);
      await this.almacenamiento.borrarSinRomper(anterior.slice(PREFIJO_URL.length));
    }
    return this.ver(id);
  }

  async leerFoto(clave: string) {
    const noExiste = () =>
      new ErrorApp(HttpStatus.NOT_FOUND, 'IMAGEN_NO_ENCONTRADA', 'La imagen no existe.');
    const coincide = CLAVE_VALIDA.exec(clave);
    if (!coincide) throw noExiste();
    if (!(await this.repo.cuentaVisible(Number(coincide[1])))) throw noExiste();
    const archivo = await this.almacenamiento.leer(clave);
    if (!archivo) throw noExiste();
    return archivo;
  }
}
