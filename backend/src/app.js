// Configura la aplicación Express SIN arrancarla (sin listen).
// Separarlo de server.js permite que las pruebas (Supertest) usen `app`
// directamente, sin abrir un puerto de verdad.
import express from 'express';

export const app = express();

// No anunciar "X-Powered-By: Express": no le regalamos pistas a un atacante.
app.disable('x-powered-by');

// Convierte el cuerpo JSON de las peticiones en req.body. El límite evita
// que alguien mande un JSON gigante para tumbar el servidor.
app.use(express.json({ limit: '100kb' }));

app.get('/api/salud', (req, res) => {
  res.json({ ok: true });
});
