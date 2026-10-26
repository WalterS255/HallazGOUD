// Procesamiento de imágenes subidas (RF-08, RNF-02). No toca la BD ni S3.
import { HttpStatus } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ErrorApp } from '../../comun/errores/error-app.js';

export const MAX_IMAGENES = 5; // RF-08
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB por archivo (RF-08)
const TIPOS_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const LADO_GRANDE = 1600; // px: suficiente para ver detalles en el celular
const LADO_MINIATURA = 480;
export const MAX_BYTES_MINIATURA = 200 * 1024; // RNF-02

export interface ImagenProcesada {
  grande: Buffer;
  miniatura: Buffer;
}

const rechazar = (mensaje: string) =>
  new ErrorApp(HttpStatus.BAD_REQUEST, 'IMAGEN_INVALIDA', mensaje);

export async function procesarImagen(contenido: Buffer, nombre: string): Promise<ImagenProcesada> {
  // 1) ¿QUÉ es de verdad? Se miran los primeros bytes (la "firma" del formato).
  //    La extensión (.jpg) y el tipo que manda el navegador se pueden falsificar;
  //    los bytes de un JPEG real siempre empiezan igual (FF D8 FF).
  const tipo = await fileTypeFromBuffer(contenido);
  if (!tipo || !TIPOS_PERMITIDOS.has(tipo.mime)) {
    throw rechazar(`"${nombre}" no es una imagen JPG, PNG o WEBP.`);
  }

  // 2) Se vuelve a dibujar la imagen desde cero y se guarda como WEBP:
  //    - .rotate() sin argumentos endereza la foto según la orientación del EXIF
  //      (si no, las fotos de celular salen de lado al quitar los metadatos);
  //    - sharp NO copia los metadatos al guardar: se pierden el EXIF y, con él,
  //      las coordenadas GPS de dónde se tomó la foto (privacidad).
  //    - reconvertir también elimina cualquier contenido extraño escondido en el archivo.
  let base: ReturnType<typeof sharp>;
  try {
    base = sharp(contenido, { limitInputPixels: 40_000_000 }).rotate();
    await base.metadata(); // falla aquí si el archivo dice ser imagen pero está dañado
  } catch {
    throw rechazar(`"${nombre}" está dañada o no se puede abrir.`);
  }

  const grande = await base
    .clone()
    .resize(LADO_GRANDE, LADO_GRANDE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  // 3) Miniatura para el catálogo (RNF-02: ≤ 200 KB). Casi siempre basta la primera
  //    calidad; si una foto muy detallada se pasa, se baja la calidad hasta que quepa.
  let miniatura = Buffer.alloc(0);
  for (const calidad of [70, 55, 40, 25]) {
    miniatura = await base
      .clone()
      .resize(LADO_MINIATURA, LADO_MINIATURA, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: calidad })
      .toBuffer();
    if (miniatura.length <= MAX_BYTES_MINIATURA) break;
  }

  return { grande, miniatura };
}
