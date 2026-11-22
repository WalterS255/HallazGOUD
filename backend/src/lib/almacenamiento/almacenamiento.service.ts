import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../../config/configuracion.js';

export interface ArchivoGuardado {
  contenido: Buffer;
  tipo: string; // tipo MIME, p. ej. image/webp
}

// Guarda y lee archivos en un almacenamiento compatible con S3 (SeaweedFS, §4).
// El backend usa el SDK oficial de AWS: cambiar de proveedor es solo cambiar el .env.
//
// El bucket es PRIVADO (SeaweedFS rechaza lo anónimo con 403). Las imágenes se sirven
// a través del backend (GET /api/imagenes/…), que las lee de aquí.
//
// En las pruebas (NODE_ENV=test) no se conecta a S3: guarda en memoria, como
// CorreoService. Así las pruebas no dependen de que SeaweedFS esté encendido.
@Injectable()
export class AlmacenamientoService implements OnModuleInit {
  private readonly logger = new Logger(AlmacenamientoService.name);
  private readonly s3: S3Client | null;
  readonly enMemoria = new Map<string, ArchivoGuardado>();

  constructor() {
    this.s3 =
      config.entorno === 'test'
        ? null
        : new S3Client({
            endpoint: config.s3.endpoint,
            region: config.s3.region,
            credentials: {
              accessKeyId: config.s3.llaveAcceso,
              secretAccessKey: config.s3.llaveSecreta,
            },
            // SeaweedFS (y MinIO) usan http://host/bucket/clave, no bucket.host/clave.
            forcePathStyle: true,
          });
  }

  // Crea el bucket si no existe: en una instalación nueva (también un VPS recién
  // montado) no lo hay, y la primera foto fallaría. Es seguro repetirlo: primero pregunta.
  // Si las llaves no permiten crearlo, se registra el error y la app arranca igual.
  async onModuleInit(): Promise<void> {
    if (!this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
        this.logger.log(`Bucket "${config.s3.bucket}" creado`);
      } catch (e) {
        // No se detiene el arranque: /api/salud sigue respondiendo y el error se ve aquí.
        this.logger.error(`No se pudo preparar el bucket: ${(e as Error).message}`);
      }
    }
  }

  async subir(clave: string, contenido: Buffer, tipo: string): Promise<void> {
    if (!this.s3) {
      this.enMemoria.set(clave, { contenido, tipo });
      return;
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: clave,
        Body: contenido,
        ContentType: tipo,
      }),
    );
  }

  async leer(clave: string): Promise<ArchivoGuardado | null> {
    if (!this.s3) return this.enMemoria.get(clave) ?? null;
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: clave }));
      const bytes = await r.Body!.transformToByteArray();
      return { contenido: Buffer.from(bytes), tipo: r.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  // Borrar nunca debe romper la operación principal: si falla, queda un archivo
  // huérfano en S3 (se registra), pero no una publicación a medias.
  async borrarSinRomper(clave: string): Promise<void> {
    if (!this.s3) {
      this.enMemoria.delete(clave);
      return;
    }
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: clave }));
    } catch (e) {
      this.logger.error(`No se pudo borrar ${clave}: ${(e as Error).message}`);
    }
  }
}
