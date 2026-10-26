import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { config } from '../../config/configuracion.js';

export interface Correo {
  para: string;
  asunto: string;
  texto: string; // versión en texto plano (la leen los lectores de pantalla y algunos clientes)
  html: string;
}

// Envía correos por SMTP. En desarrollo el SMTP es Mailpit (http://localhost:8025):
// los atrapa todos y no sale nada a Internet. En producción, el SMTP real del .env.
//
// En las pruebas (NODE_ENV=test) NO se conecta a ningún servidor: guarda los correos
// en `enviadosEnPrueba` para que la prueba revise qué se habría enviado. Así las
// pruebas no fallan porque Mailpit esté apagado.
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private readonly transporte: Transporter | null;
  readonly enviadosEnPrueba: Correo[] = [];

  constructor() {
    this.transporte =
      config.entorno === 'test'
        ? null
        : createTransport({
            host: config.smtp.host,
            port: config.smtp.puerto,
            // Mailpit (1025) no usa TLS. Con un SMTP real en el puerto 465 sería `secure: true`.
            secure: config.smtp.puerto === 465,
          });
  }

  async enviar(correo: Correo): Promise<void> {
    if (!this.transporte) {
      this.enviadosEnPrueba.push(correo);
      return;
    }
    await this.transporte.sendMail({
      from: config.smtp.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    // Al log va a QUIÉN y QUÉ asunto, nunca el contenido (lleva el enlace con el token).
    this.logger.log(`Correo "${correo.asunto}" enviado a ${correo.para}`);
  }
}
