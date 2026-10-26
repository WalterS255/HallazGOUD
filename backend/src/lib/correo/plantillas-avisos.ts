// Correo de las notificaciones (RF-25). Archivo aparte de plantillas.ts (auth) para
// no tocar las plantillas de la cuenta. Mismo cuidado: lo que escribió un usuario
// (su nombre, el título de una publicación) se escapa antes de ir al HTML.
import { config } from '../../config/configuracion.js';
import type { Correo } from './correo.service.js';
import { escaparHtml } from './plantillas.js';

// El correo NUNCA lleva datos sensibles (ni el detalle reservado, ni el texto de un
// mensaje del chat): solo avisa y manda a la app, donde se ve con sesión.
export function correoAviso(para: string, nombre: string, mensaje: string, ruta: string): Correo {
  const enlace = `${config.urlFrontend}${ruta}`;
  const html = `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:16px">
  <p>Hola, ${escaparHtml(nombre)}:</p>
  <p>${escaparHtml(mensaje)}</p>
  <p><a href="${enlace}" style="display:inline-block;background:#0b4f8a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Ver en HallazGO UD</a></p>
  <p style="font-size:13px;color:#4b5563">Puedes apagar estos correos en tu perfil (Preferencias de notificación).</p>
  <p style="font-size:13px;color:#4b5563">— HallazGO UD · Lo que se pierde en la U, en la U aparece</p>
</body></html>`;
  return {
    para,
    asunto: `HallazGO UD: ${mensaje.length > 70 ? `${mensaje.slice(0, 67)}…` : mensaje}`,
    texto: `Hola, ${nombre}:\n\n${mensaje}\n\nVer en HallazGO UD: ${enlace}\n\nPuedes apagar estos correos en tu perfil.\n\n— HallazGO UD`,
    html,
  };
}
