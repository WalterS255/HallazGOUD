// Textos de los correos. Son funciones puras: reciben los datos y devuelven el correo.
import { config } from '../../config/configuracion.js';
import type { Correo } from './correo.service.js';

// El nombre lo escribió el usuario: se escapa para que nadie meta HTML en el correo
// (por ejemplo, registrarse con el nombre "<a href=…>Haz clic</a>").
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plantilla(
  titulo: string,
  nombre: string,
  parrafo: string,
  enlace: string,
  boton: string,
  nota: string,
) {
  const html = `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:16px">
  <h1 style="font-size:20px">${titulo}</h1>
  <p>Hola, ${escaparHtml(nombre)}:</p>
  <p>${parrafo}</p>
  <p><a href="${enlace}" style="display:inline-block;background:#0b4f8a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${boton}</a></p>
  <p style="font-size:13px;color:#4b5563">Si el botón no funciona, copia este enlace en tu navegador:<br>${enlace}</p>
  <p style="font-size:13px;color:#4b5563">${nota}</p>
  <p style="font-size:13px;color:#4b5563">— HallazGO UD · Lo que se pierde en la U, en la U aparece</p>
</body></html>`;
  const texto = `Hola, ${nombre}:\n\n${parrafo}\n\n${boton}: ${enlace}\n\n${nota}\n\n— HallazGO UD`;
  return { html, texto };
}

export function correoVerificacion(para: string, nombre: string, token: string): Correo {
  const enlace = `${config.urlFrontend}/verificar/${token}`;
  return {
    para,
    asunto: 'Activa tu cuenta de HallazGO UD',
    ...plantilla(
      'Activa tu cuenta',
      nombre,
      'Gracias por registrarte. Para empezar a usar HallazGO UD, confirma tu correo institucional.',
      enlace,
      'Activar mi cuenta',
      'El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo.',
    ),
  };
}

export function correoRecuperacion(para: string, nombre: string, token: string): Correo {
  const enlace = `${config.urlFrontend}/restablecer/${token}`;
  return {
    para,
    asunto: 'Restablece tu contraseña de HallazGO UD',
    ...plantilla(
      'Restablece tu contraseña',
      nombre,
      'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
      enlace,
      'Elegir una contraseña nueva',
      'El enlace vence en 1 hora y solo sirve una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    ),
  };
}
