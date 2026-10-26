import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { AlmacenamientoService } from '../../lib/almacenamiento/almacenamiento.service.js';
import { esEditable } from './estados.js';
import type { Contexto } from './gestion.service.js';
import { GestionRepository } from './gestion.repository.js';
import { ImagenesRepository } from './imagenes.repository.js';
import { type ImagenProcesada, MAX_IMAGENES, procesarImagen } from './imagenes.procesar.js';

export interface ArchivoSubido {
  buffer: Buffer;
  originalname: string;
}

// Las URL que se guardan apuntan al backend, que lee la imagen del bucket privado.
const PREFIJO_URL = '/api/imagenes/';
// Solo se sirven claves con la forma exacta que genera este servicio: así nadie puede
// pedir "../../otra-cosa" ni leer archivos que no sean imágenes de publicaciones.
const CLAVE_VALIDA = /^publicaciones\/(\d+)\/[0-9a-f-]{36}(?:_min)?\.webp$/;

@Injectable()
export class ImagenesService {
  constructor(
    private readonly repo: ImagenesRepository,
    private readonly gestion: GestionRepository,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  // POST /publicaciones/:id/imagenes — de 1 a 5 imágenes por publicación (RF-08).
  async subir(id: number, archivos: ArchivoSubido[], ctx: Contexto) {
    if (archivos.length === 0) {
      throw new ErrorApp(HttpStatus.BAD_REQUEST, 'SIN_IMAGENES', 'Adjunta al menos una imagen.');
    }
    // 1) Procesar ANTES de abrir la transacción: es lo más lento (CPU) y no necesita la BD.
    //    Si una sola imagen es inválida, no se guarda ninguna.
    const procesadas: ImagenProcesada[] = [];
    for (const a of archivos) procesadas.push(await procesarImagen(a.buffer, a.originalname));

    const subidas: string[] = []; // claves ya en S3, por si hay que deshacer
    const ahora = new Date();
    try {
      return await this.repo.enTransaccion(async (tx) => {
        // 2) Bloquear la publicación (FOR UPDATE): si llegan dos subidas a la vez, la
        //    segunda espera y ve las imágenes de la primera; así nunca pasan de 5.
        const pub = await this.gestion.paraEditar(tx, id);
        if (!pub) {
          throw new ErrorApp(
            HttpStatus.NOT_FOUND,
            'PUBLICACION_NO_ENCONTRADA',
            'La publicación no existe.',
          );
        }
        if (pub.id_usuario !== ctx.usuario.id) {
          throw new ErrorApp(
            HttpStatus.FORBIDDEN,
            'PROHIBIDO',
            'Solo el autor puede agregar imágenes.',
          );
        }
        if (!esEditable(pub.estado)) {
          throw new ErrorApp(
            HttpStatus.CONFLICT,
            'PUBLICACION_NO_EDITABLE',
            `Una publicación ${pub.estado} ya no se puede editar.`,
          );
        }
        const usados = new Set(await this.repo.ordenesUsados(tx, id));
        if (usados.size + procesadas.length > MAX_IMAGENES) {
          throw new ErrorApp(
            HttpStatus.CONFLICT,
            'DEMASIADAS_IMAGENES',
            `Una publicación puede tener máximo ${MAX_IMAGENES} imágenes (ya tiene ${usados.size}).`,
          );
        }
        const libres = [1, 2, 3, 4, 5].filter((o) => !usados.has(o));

        // 3) Subir a S3 y registrar en la BD.
        for (const [i, img] of procesadas.entries()) {
          const base = `publicaciones/${id}/${randomUUID()}`;
          await this.almacenamiento.subir(`${base}.webp`, img.grande, 'image/webp');
          subidas.push(`${base}.webp`);
          await this.almacenamiento.subir(`${base}_min.webp`, img.miniatura, 'image/webp');
          subidas.push(`${base}_min.webp`);
          await this.repo.crear(tx, {
            id_publicacion: id,
            url: `${PREFIJO_URL}${base}.webp`,
            url_miniatura: `${PREFIJO_URL}${base}_min.webp`,
            orden: libres[i]!,
          });
        }
        await this.repo.marcarActividad(tx, id, ahora); // regla 6.1
        return this.repo.listar(tx, id);
      });
    } catch (e) {
      // Si algo falló después de subir a S3, la transacción deshace la BD; los archivos
      // de S3 hay que borrarlos a mano (S3 no participa de la transacción).
      for (const clave of subidas) await this.almacenamiento.borrarSinRomper(clave);
      throw e;
    }
  }

  // DELETE /publicaciones/:id/imagenes/:orden
  async borrar(id: number, orden: number, ctx: Contexto) {
    const borrada = await this.repo.enTransaccion(async (tx) => {
      const pub = await this.gestion.paraEditar(tx, id);
      if (!pub) {
        throw new ErrorApp(
          HttpStatus.NOT_FOUND,
          'PUBLICACION_NO_ENCONTRADA',
          'La publicación no existe.',
        );
      }
      if (pub.id_usuario !== ctx.usuario.id) {
        throw new ErrorApp(
          HttpStatus.FORBIDDEN,
          'PROHIBIDO',
          'Solo el autor puede quitar imágenes.',
        );
      }
      if (!esEditable(pub.estado)) {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'PUBLICACION_NO_EDITABLE',
          `Una publicación ${pub.estado} ya no se puede editar.`,
        );
      }
      const img = await this.repo.borrar(tx, id, orden);
      if (!img) {
        throw new ErrorApp(HttpStatus.NOT_FOUND, 'IMAGEN_NO_ENCONTRADA', 'La imagen no existe.');
      }
      await this.repo.marcarActividad(tx, id, new Date());
      return img;
    });
    // Se borra de S3 solo DESPUÉS de confirmar en la BD.
    for (const url of [borrada.url, borrada.url_miniatura]) {
      await this.almacenamiento.borrarSinRomper(url.slice(PREFIJO_URL.length));
    }
    return { orden, borrada: true };
  }

  // GET /api/imagenes/<clave> — sirve la imagen desde el bucket privado.
  async leer(clave: string) {
    const noExiste = () =>
      new ErrorApp(HttpStatus.NOT_FOUND, 'IMAGEN_NO_ENCONTRADA', 'La imagen no existe.');
    const coincide = CLAVE_VALIDA.exec(clave);
    if (!coincide) throw noExiste();
    // Una publicación oculta por moderación no muestra sus imágenes (404, no 403:
    // así no se revela que existe).
    if (!(await this.repo.publicacionVisible(Number(coincide[1])))) throw noExiste();
    const archivo = await this.almacenamiento.leer(clave);
    if (!archivo) throw noExiste();
    return archivo;
  }
}
