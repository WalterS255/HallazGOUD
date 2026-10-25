// Punto de entrada: arranca el servidor HTTP con la app ya configurada.
import { app } from './app.js';
import { config } from './config/index.js';

const servidor = app.listen(config.puerto, () => {
  console.log(`HallazGO API escuchando en http://localhost:${config.puerto} (${config.entorno})`);
});

// Docker detiene los contenedores con la señal SIGTERM (Ctrl+C manda SIGINT).
// Cerramos con calma: dejamos de aceptar conexiones y terminamos las que están en curso.
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    console.log(`${senal} recibido, cerrando el servidor…`);
    servidor.close(() => process.exit(0));
  });
}
