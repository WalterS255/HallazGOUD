# HallazGO UD · Frontend

Aquí va la aplicación web (React + Vite + Tailwind CSS + React Router), pensada **primero para el celular**.
El backend ya está terminado y probado: el frontend solo tiene que consumir su API.

## Antes de empezar: lee esto

| Documento | Para qué |
|---|---|
| [`../docs/api.md`](../docs/api.md) | **El contrato con el backend**: todas las rutas, qué se envía, qué responde y cada código de error. Es tu referencia principal. |
| [`../docs/pendientes.md`](../docs/pendientes.md) | Decisiones de producto que todavía faltan (por ejemplo, qué ve un visitante sin sesión). |
| [`../CLAUDE.md`](../CLAUDE.md) | Requerimientos (sección 3), reglas de negocio (sección 6) y pantallas del plan (sección 9, fases F y G). |

## Decisión pendiente: versiones

`CLAUDE.md` (sección 4) dice **React 18**, pero la versión estable actual es **React 19**. Tailwind también cambió de versión mayor (la 4 se instala como plugin de Vite y no usa `tailwind.config.js`), y React Router va en la 8. **Hay que decidir con Walter antes de crear el proyecto** y actualizar la sección 4 en el mismo cambio. Recomendación: usar las versiones actuales.

## Cómo crear el proyecto (una sola vez)

Desde la raíz del repositorio, con el backend funcionando (ver el [README principal](../README.md)):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

> `npm create vite` crea los archivos **dentro de esta carpeta**; si pregunta qué hacer con lo que ya existe, conserva este `README.md`.
> `react-ts` = React con TypeScript, igual que el backend. Si el equipo prefiere JavaScript, usa `--template react`.

Después instala Tailwind y React Router siguiendo su documentación oficial **de la versión que se decida**.

## Conexión con el backend: usa el proxy de Vite

En desarrollo el frontend corre en `http://localhost:5173` y el backend en `http://localhost:3000`. Para el navegador son **orígenes distintos**, y el backend no tiene activado CORS (el permiso para que otro origen lo llame), así que las llamadas directas a `:3000` fallarían.

La solución es que Vite haga de intermediario. En `vite.config.ts`:

```ts
export default defineConfig({
  // ...plugins
  server: {
    proxy: {
      // Todo lo que empiece por /api se reenvía al backend.
      '/api': 'http://localhost:3000',
    },
  },
});
```

Así, en el código **siempre** se llama a rutas relativas, sin `localhost:3000`:

```ts
const res = await fetch('/api/publicaciones?pagina=1');
```

Las URL de las imágenes que devuelve la API (`url`, `url_miniatura`, `foto_url`) también son relativas (`/api/imagenes/…`): se usan tal cual en `<img src>`, con `loading="lazy"`.

En producción el frontend y el backend irán detrás del mismo dominio (proxy inverso), así que las mismas rutas relativas seguirán funcionando sin cambiar nada.

## Reglas que el frontend debe respetar

- **Sesión:** `POST /api/auth/login` devuelve un `token`. Se envía en cada petición que lo pida con el encabezado `Authorization: Bearer <token>`. Si una respuesta es `401 SESION_INVALIDA`, hay que mandar a iniciar sesión.
- **Errores:** todos tienen la forma `{ "error": { "codigo", "mensaje", "detalles"? } }`. Decide qué hacer con el `codigo`; muestra el `mensaje` a la persona. En los `400 SOLICITUD_INVALIDA`, `detalles` dice qué campo marcar en el formulario.
- **Fechas:** se envían en ISO 8601 y se **muestran en hora de Colombia** (`America/Bogota`).
- **Seguridad:** nunca `dangerouslySetInnerHTML` (RNF-08). React ya protege contra inyección de HTML si no se usa.
- **Accesibilidad (RNF-05):** cada campo con su `<label>`, foco visible y buen contraste.
- **Responsivo (RNF-04):** diseñar desde 360 px de ancho hacia arriba.
- **Publicar (RNF-03):** asistente en 3 pasos como máximo.
- **Objetos sensibles (regla 6.6):** si al crear una publicación la respuesta trae `aviso_sensible: true`, mostrar el aviso de tapar datos personales en la foto.

## Pantallas de la primera entrega (Fase F)

1. **Inicio**
2. **Catálogo:** `GET /api/publicaciones` con filtros, búsqueda, orden y paginación.
3. **Detalle:** `GET /api/publicaciones/:id`, con galería.
4. **Asistente para publicar** en 3 pasos: `POST /api/publicaciones` y luego `POST /api/publicaciones/:id/imagenes`.
5. Registro, activación (`/verificar/:token`), inicio de sesión y recuperación (`/restablecer/:token`). **Estas dos rutas del frontend deben existir con esos nombres**: los enlaces de los correos que envía el backend apuntan ahí.

Para probar con datos: el seed del backend crea 3 cuentas de prueba (una por rol); la contraseña está en `CONTRASENA_SEED` del `.env` de quien levantó el backend.
