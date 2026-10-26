import sharp from 'sharp';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { MAX_BYTES_MINIATURA, procesarImagen } from './imagenes.procesar.js';

// Imagen de prueba hecha en memoria: ruido aleatorio (difícil de comprimir, el peor caso).
async function imagenDePrueba(ancho: number, alto: number, formato: 'jpeg' | 'png' = 'jpeg') {
  const pixeles = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < pixeles.length; i++) pixeles[i] = Math.floor(Math.random() * 256);
  return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 3 } })
    .toFormat(formato)
    .toBuffer();
}

async function errorDe(p: Promise<unknown>): Promise<ErrorApp> {
  try {
    await p;
  } catch (e) {
    return e as ErrorApp;
  }
  throw new Error('se esperaba un error');
}

describe('procesarImagen', () => {
  it('convierte a WEBP, reduce a 1600 px y deja una miniatura ≤ 200 KB (RNF-02)', async () => {
    const r = await procesarImagen(await imagenDePrueba(3000, 2000), 'foto.jpg');
    const grande = await sharp(r.grande).metadata();
    const mini = await sharp(r.miniatura).metadata();
    expect(grande.format).toBe('webp');
    expect(Math.max(grande.width!, grande.height!)).toBe(1600);
    expect(Math.max(mini.width!, mini.height!)).toBe(480);
    expect(r.miniatura.length).toBeLessThanOrEqual(MAX_BYTES_MINIATURA);
  });

  it('no agranda una imagen pequeña', async () => {
    const r = await procesarImagen(await imagenDePrueba(300, 200, 'png'), 'mini.png');
    expect((await sharp(r.grande).metadata()).width).toBe(300);
  });

  it('BORRA el GPS y demás metadatos EXIF de la foto (privacidad)', async () => {
    const conGps = await sharp(await imagenDePrueba(400, 300))
      .withExif({ IFD0: { Make: 'Celular de prueba' }, IFD3: { GPSLatitudeRef: 'N' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(conGps).metadata()).exif).toBeDefined(); // la original SÍ lo trae

    const r = await procesarImagen(conGps, 'foto.jpg');
    expect((await sharp(r.grande).metadata()).exif).toBeUndefined();
    expect((await sharp(r.miniatura).metadata()).exif).toBeUndefined();
  });

  it('rechaza un archivo que NO es imagen aunque se llame .jpg', async () => {
    const e = await errorDe(procesarImagen(Buffer.from('MZ… soy un ejecutable'), 'foto.jpg'));
    expect(e.codigo).toBe('IMAGEN_INVALIDA');
    expect(e.getStatus()).toBe(400);
  });

  it('rechaza formatos de imagen no permitidos (GIF)', async () => {
    const gif = await sharp(await imagenDePrueba(10, 10))
      .gif()
      .toBuffer();
    expect((await errorDe(procesarImagen(gif, 'animado.gif'))).codigo).toBe('IMAGEN_INVALIDA');
  });

  it('rechaza un JPEG cortado a la mitad (dañado)', async () => {
    const jpeg = await imagenDePrueba(400, 300);
    const cortado = jpeg.subarray(0, 200); // conserva la firma FF D8 FF, pero está incompleto
    expect((await errorDe(procesarImagen(cortado, 'rota.jpg'))).codigo).toBe('IMAGEN_INVALIDA');
  });
});
