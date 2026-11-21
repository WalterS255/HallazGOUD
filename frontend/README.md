# HallazGO UD · Frontend

Aplicación web en **Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + TypeScript**, pensada primero
para el celular. No tiene base de datos ni reglas de negocio: todo lo pide al backend de este
repositorio siguiendo [`../docs/api.md`](../docs/api.md).

| Documento | Para qué |
|---|---|
| [`../docs/api.md`](../docs/api.md) | El contrato con el backend: rutas, campos y códigos de error |
| [`docs/endpoints-pendientes.md`](docs/endpoints-pendientes.md) | Lo que el frontend necesita y el backend aún no tiene |
| [`docs/referencia-diseno-demo.html`](docs/referencia-diseno-demo.html) | Prototipo del diseño (se abre con doble clic, con datos de ejemplo) |
| [`../docs/pendientes.md`](../docs/pendientes.md) | Decisiones de producto pendientes |

## Puesta en marcha

Requisitos: Node.js 24 y el backend funcionando (ver el [README principal](../README.md)).

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Abre http://localhost:3001. Antes de arrancar, `npm run dev` comprueba que el backend y la base de datos
respondan. En http://localhost:3001/estado hay un diagnóstico de la conexión con el backend.

Para que los enlaces de los correos (activación y recuperación) abran el frontend, el `.env` de la raíz
debe tener `URL_FRONTEND=http://localhost:3001`.

## Cómo se conecta con el backend

```
Navegador ──► Frontend (Next.js, :3001) ──► Backend (NestJS, :3000/api)
              ├─ páginas: piden los datos desde el servidor de Next, con el token del usuario
              └─ /api/*: proxy que reenvía formularios, botones y subida de imágenes
```

- **Sin CORS:** el navegador sólo habla con el frontend; el proxy (`src/app/api/[...ruta]/route.ts`)
  reenvía a `BACKEND_URL`. En producción pueden ir detrás del mismo dominio sin cambiar código.
- **Sesión:** el `token` de `POST /auth/login` se guarda en una cookie `httpOnly` del frontend y se envía
  como `Authorization: Bearer …`. El código del navegador nunca lo ve, así que un XSS no puede robarlo.
  Un `401` del backend borra la cookie y la persona vuelve a ingresar. "Salir" borra la cookie (el
  backend no tiene logout porque el JWT no se invalida en el servidor).
- **Errores:** se lee `{ error: { codigo, mensaje, detalles } }`. El `mensaje` se muestra; los `detalles`
  marcan cada campo del formulario; el `codigo` decide acciones (por ejemplo, ofrecer "Reenviar correo
  de activación" ante `CUENTA_NO_VERIFICADA`). Con `429` se usa `Retry-After`.
- **Imágenes:** las URL de la API (`/api/imagenes/…`) se usan tal cual, con `loading="lazy"`.
- **Fechas:** se envían en ISO con zona de Colombia (`-05:00`) y se muestran en `America/Bogota`.

## Diseño

El sistema visual sale del prototipo [`docs/referencia-diseno-demo.html`](docs/referencia-diseno-demo.html):
tema **oscuro por defecto** con opción de tema claro (botón ☀/☾ del encabezado, se recuerda en el
navegador), tipografías Archivo (títulos), Atkinson Hyperlegible (texto, pensada para baja visión) y
JetBrains Mono (folios y cifras), y la **etiqueta de cartón de objetos perdidos** como elemento propio.

Todos los colores están como variables en `src/app/globals.css` (`--bg`, `--surface`, `--accent`…);
Tailwind se usa sólo para la disposición. Para cambiar un color se cambia la variable, no cada pantalla.

## Estructura

```
src/app/                 Páginas: cada carpeta es una ruta
  api/[...ruta]/         Proxy hacia el backend
  verificar/[token]/     Enlace del correo de activación (api.md §3)
  restablecer/[token]/   Enlace del correo de recuperación (api.md §3)
src/components/          Componentes ('use client' = interactivos)
src/lib/api/servidor.ts  Llamadas al backend desde las páginas (con el token)
src/lib/api/cliente.ts   Llamadas desde el navegador (pasan por el proxy) y lectura de errores
src/lib/tipos.ts         Tipos de las respuestas, reflejo de api.md
src/lib/formato.ts       Fechas, folios, íconos de categoría y enlaces de los avisos
```

## Pantallas

| Pantalla | Ruta | Estado |
|---|---|---|
| Inicio: búsqueda, cifras, categorías, sedes, recientes | `/` | ✅ |
| Catálogo con filtros, orden y paginación | `/publicaciones` | ✅ |
| Detalle: galería, reclamar, reportar; para el autor: reclamaciones, coincidencias, fotos, retirar | `/publicaciones/[id]` | ✅ |
| Asistente de publicación en 3 pasos | `/publicar` | ✅ |
| Registro, ingreso, activación, recuperación | `/registro`, `/login`, `/verificar/[token]`, `/recuperar`, `/restablecer/[token]` | ✅ |
| Chat y doble confirmación de entrega (sabe quién ya confirmó, con `GET /reclamaciones/:id`) | `/mensajes/[id]` | ✅ |
| Notificaciones | `/notificaciones` | ✅ |
| Perfil con foto | `/perfil` | ✅ |
| Moderación y estadísticas | `/admin` | ✅ |
| Catálogos: categorías, sedes y lugares (con tipo de lugar) — solo ADMIN | `/admin/catalogos` | ✅ |
| Cuentas: buscar, suspender y reactivar — solo ADMIN | `/admin/cuentas` | ✅ |
| Mis publicaciones y mis reclamaciones | `/mis-publicaciones` | ✅ |
| Lista de chats | `/mensajes` | ✅ |
| Editar publicación (el detalle reservado se bloquea si ya hay reclamaciones) | `/publicaciones/[id]/editar` | ✅ |

## Reglas que respeta

- **Seguridad:** nunca `dangerouslySetInnerHTML` (RNF-08); el token nunca llega al JavaScript del navegador.
- **Accesibilidad (RNF-05):** cada campo con su `<label>`, foco visible, `aria-invalid` en los errores,
  enlace "Saltar al contenido" y contraste revisado en los dos temas.
- **Responsivo (RNF-04):** desde 360 px de ancho.
- **Publicar (RNF-03):** asistente en 3 pasos.
- **Objetos sensibles (regla 6.6):** aviso de tapar datos personales al elegir una categoría sensible.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo en el puerto 3001 |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run typecheck` | Verificación de tipos |
| `npm run test:e2e` | Playwright: el recorrido completo en un navegador real a 360 px (ver `docs/pruebas.md` §8) |
| `npm run test:e2e:ver` | Lo mismo, mostrando el navegador |
