# API REST de HallazGO UD

Referencia para conectar el frontend con el backend. Todo lo que aparece aquí está
implementado y probado (pruebas unitarias, e2e y contra PostgreSQL real).

> Las rutas, campos y códigos se tomaron del código (`backend/src/modules/**`). Si algo
> no coincide con lo que responde el servidor, manda el código y este archivo se corrige.

## Índice

1. [Convenciones](#1-convenciones)
2. [Salud](#2-salud)
3. [Autenticación](#3-autenticación)
4. [Perfil](#4-perfil)
5. [Catálogos públicos](#5-catálogos-públicos)
6. [Publicaciones: consulta](#6-publicaciones-consulta)
7. [Publicaciones: crear, editar y retirar](#7-publicaciones-crear-editar-y-retirar)
8. [Imágenes](#8-imágenes)
9. [Coincidencias](#9-coincidencias)
10. [Reclamaciones, chat y entrega](#10-reclamaciones-chat-y-entrega)
11. [Notificaciones](#11-notificaciones)
12. [Reportes](#12-reportes)
13. [Administración](#13-administración)
14. [Tabla de códigos de error](#14-tabla-de-códigos-de-error)
15. [Flujos completos](#15-flujos-completos)

---

## 1. Convenciones

### Dirección base
- Local: `http://localhost:3000/api`
- Todas las rutas empiezan por `/api`. En este documento se omite: `GET /publicaciones` significa `GET http://localhost:3000/api/publicaciones`.

### Formato
- Cuerpos en **JSON** (`Content-Type: application/json`), salvo la subida de imágenes, que es `multipart/form-data`.
- Los nombres de los campos están en español y en `snake_case` (`id_categoria`, `fecha_suceso`), igual que en la base de datos. Excepción heredada de auth: `aceptaPolitica` en el registro.

### Sesión (JWT)
- `POST /auth/login` devuelve un `token`. Se envía en cada petición que lo necesite:
  ```
  Authorization: Bearer <token>
  ```
- El token dura lo que diga `JWT_EXPIRA_EN` (por defecto **1 día**). No hay "refresh token": al vencer, se vuelve a iniciar sesión.
- Sin el encabezado, la petición se trata como **visitante**. Con un token vencido o alterado: `401 SESION_INVALIDA` (el frontend debe mandar a iniciar sesión). Con la cuenta suspendida: `401 CUENTA_SUSPENDIDA`, aunque el token no haya vencido.
- El token lleva dentro `{ sub: id_usuario, rol }`. El frontend puede leer el rol para mostrar u ocultar menús, pero **la decisión real la toma siempre el servidor**, con el rol que está en la base en ese momento (no el del token).

### Niveles de acceso
| Acceso | Significa |
|---|---|
| público | Sin sesión. Un **visitante** solo lee: catálogo, búsqueda, ficha, catálogos e imágenes. Toda escritura (publicar, reclamar, reportar, chatear…) pide sesión |
| sesión | Cualquier usuario con sesión (`USUARIO`, `MODERADOR` o `ADMIN`) |
| autor | Con sesión **y** ser el autor de esa publicación (lo revisa el servidor) |
| partes | Con sesión **y** ser el autor o el reclamante de esa reclamación |
| moderador | Rol `MODERADOR` o `ADMIN` |
| admin | Rol `ADMIN` |

Sin sesión donde se pide: `401 NO_AUTENTICADO`. Con sesión pero sin permiso: `403 PROHIBIDO`.

### Errores
Todas las respuestas de error tienen la misma forma:
```json
{ "error": { "codigo": "PUBLICACION_NO_ENCONTRADA", "mensaje": "La publicación no existe." } }
```
- `codigo`: para que el **frontend decida** qué hacer (no cambia).
- `mensaje`: en español, para **mostrarle a la persona**.
- Los errores de validación (`400 SOLICITUD_INVALIDA`) agregan `detalles`, uno por campo, para marcar cada campo del formulario:
  ```json
  {
    "error": {
      "codigo": "SOLICITUD_INVALIDA",
      "mensaje": "Revisa los datos enviados.",
      "detalles": [
        { "campo": "correo", "mensaje": "Usa tu correo institucional @udistrital.edu.co" },
        { "campo": "contrasena", "mensaje": "La contraseña debe tener al menos 8 caracteres" }
      ]
    }
  }
  ```
- Los `500` nunca traen detalles internos: `ERROR_INTERNO` con un mensaje genérico.

### Paginación
- `?pagina=1&limite=20` (límite máximo **50**).
- Respuesta: `{ "datos": [...], "total": 123, "pagina": 1, "limite": 20 }`.

### Fechas
- Se envían y reciben en **ISO 8601** (`"2026-10-25T14:30:00-05:00"` o en UTC con `Z`).
- El servidor guarda en UTC; el frontend debe **mostrarlas en hora de Colombia** (`America/Bogota`).

### Identificadores en la ruta
- Los `:id` son enteros positivos. `/publicaciones/abc` → `400 SOLICITUD_INVALIDA` antes de llegar a la base.

### Límite de peticiones (rate limit)
- General: **100 peticiones por minuto** por IP.
- Estricto: **5 por minuto** en `registro`, `login`, `recuperar`, `reenviar-verificacion` y `restablecer`.
- Al pasarse: `429 DEMASIADAS_SOLICITUDES`, con el encabezado **`Retry-After`** (cuántos segundos esperar): el frontend puede mostrar "intenta de nuevo en N segundos".
- `/salud` y las imágenes públicas no tienen límite.
- La IP sale de `X-Forwarded-For` solo si `TRUST_PROXY` lo permite (el frontend Next.js la pone; ver `.env.example`). Un `X-Forwarded-For` inventado por el cliente no cambia el conteo.

### Lo que NUNCA devuelve la API (regla 6.3)
Correo de **otras** personas, teléfono, `hash_contrasena`, tokens ni el **detalle reservado** (este último solo lo ve el autor, en `GET /publicaciones/:id/reclamaciones`). De otras personas solo se devuelve `{ id, nombre }`. Hay pruebas automáticas que fallan si alguna respuesta lo filtra.

---

## 2. Salud

### `GET /salud` · público
¿El servidor está vivo? No toca la base de datos.
```json
{ "ok": true }
```

### `GET /salud/bd` · público
¿Llega a la base de datos?
```json
{ "ok": true, "bd": "conectada", "latencia_ms": 4 }
```
Errores: `503 BD_NO_DISPONIBLE`.

---

## 3. Autenticación

### `POST /auth/registro` · público · límite estricto
Crea la cuenta **sin verificar** y envía el correo de activación (RF-01, RF-02).
```json
{
  "nombre": "Ana Pérez",
  "correo": "aperez@udistrital.edu.co",
  "programa": "Ingeniería de Sistemas",
  "contrasena": "clave1234",
  "aceptaPolitica": true
}
```
| Campo | Reglas |
|---|---|
| `nombre` | 2 a 120 caracteres |
| `correo` | Debe terminar en `@udistrital.edu.co`. Se guarda en minúsculas |
| `programa` | Programa o dependencia, 2 a 160 caracteres |
| `contrasena` | Mínimo 8 caracteres, al menos una letra y un número, máximo 72 **bytes** (límite de bcrypt) |
| `aceptaPolitica` | Debe ser `true` (Ley 1581) |

Respuesta `201`:
```json
{ "mensaje": "Te enviamos un correo para activar tu cuenta." }
```
Errores: `400 SOLICITUD_INVALIDA`, `409 CORREO_REGISTRADO`.

### `GET /auth/verificar/:token` · público
El enlace del correo de activación. El frontend recibe el usuario en `/verificar/<token>` y llama a esta ruta.
```json
{ "mensaje": "Tu cuenta quedó activada. Ya puedes iniciar sesión." }
```
Errores: `400 TOKEN_INVALIDO`, `400 TOKEN_USADO`, `400 TOKEN_EXPIRADO` (dura 24 h).

### `POST /auth/login` · público · límite estricto
```json
{ "correo": "aperez@udistrital.edu.co", "contrasena": "clave1234" }
```
Respuesta `200`:
```json
{ "token": "eyJhbGciOi…", "usuario": { "id": 12, "nombre": "Ana Pérez", "rol": "USUARIO" } }
```
Errores:
| Código | Estado | Cuándo |
|---|---|---|
| `SOLICITUD_INVALIDA` | 400 | Datos mal formados (por ejemplo, contraseña de más de 72 bytes) |
| `CREDENCIALES_INVALIDAS` | 401 | Correo inexistente **o** contraseña mala (mismo mensaje a propósito) |
| `CUENTA_BLOQUEADA` | 423 | 5 intentos fallidos: bloqueada 15 minutos. Aparece **aunque la contraseña sea correcta** |
| `CUENTA_NO_VERIFICADA` | 403 | No ha activado la cuenta. Solo con la contraseña **correcta** |
| `CUENTA_SUSPENDIDA` | 403 | Un admin la suspendió. Solo con la contraseña **correcta** |

Con una contraseña mala la respuesta es siempre `401 CREDENCIALES_INVALIDAS`, para no revelar el estado de la cuenta.

### `POST /auth/recuperar` · público · límite estricto
Envía el enlace para restablecer la contraseña (RF-04).
```json
{ "correo": "aperez@udistrital.edu.co" }
```
Respuesta `202` **siempre igual**, exista o no el correo (para no revelar qué correos están registrados).

### `POST /auth/reenviar-verificacion` · público · límite estricto
Si el correo de activación no llegó o venció. Mismo cuerpo que `recuperar`. Respuesta `202` siempre, con su propio mensaje:
```json
{ "mensaje": "Si tu cuenta existe y aún no está activada, te enviamos un nuevo enlace." }
```
- Solo envía si la cuenta existe, **no** está verificada y está ACTIVA (la respuesta no lo revela).
- Al enviar uno nuevo, **el enlace anterior deja de servir**.
- Si el último enlace se envió hace **menos de 2 minutos**, no se manda otro (la respuesta es la misma): conviene que el botón "Reenviar" se desactive 2 minutos.

### `POST /auth/restablecer` · público · límite estricto
El enlace de recuperación lleva al frontend a `/restablecer/<token>`; ahí se pide la nueva contraseña.
```json
{ "token": "<64 caracteres hex>", "contrasena": "nuevaClave99" }
```
Respuesta `200`: `{ "mensaje": "Tu contraseña se cambió. Ya puedes iniciar sesión." }`.
El enlace dura **1 hora**, es de un solo uso, anula los demás enlaces pendientes y quita el bloqueo por intentos.
Errores: `400 SOLICITUD_INVALIDA`, `400 TOKEN_INVALIDO`, `400 TOKEN_USADO`, `400 TOKEN_EXPIRADO`.

---

## 4. Perfil

### `GET /usuarios/me` · sesión
Mis datos (es el único lugar donde la API devuelve un correo: **el propio**).
```json
{
  "id": 12,
  "nombre": "Ana Pérez",
  "correo": "aperez@udistrital.edu.co",
  "programa": "Ingeniería de Sistemas",
  "foto_url": "/api/imagenes/usuarios/12/<archivo>.webp",
  "rol": "USUARIO",
  "notificar_por_correo": true,
  "fecha_registro": "2026-10-25T19:40:00.000Z"
}
```

### `PUT /usuarios/me` · sesión
Editar datos básicos y preferencias (RF-05). Solo se pueden cambiar `nombre`, `programa` y `notificar_por_correo`; todos opcionales, pero al menos uno. **El correo no se cambia.** `notificar_por_correo` es un booleano real (`true`/`false`), no el texto `"true"`.
```json
{ "nombre": "Ana María Pérez", "programa": "Ing. de Sistemas", "notificar_por_correo": false }
```
Respuesta: el perfil actualizado (misma forma que `GET /usuarios/me`).

### `POST /usuarios/me/foto` · sesión
`multipart/form-data` con **un** archivo en el campo `foto`. JPG, PNG o WEBP, máximo 5 MB. Se convierte a WEBP y se le quitan los metadatos (incluido el GPS).
Respuesta: el perfil actualizado.
Errores: `400 SIN_IMAGENES` (no se adjuntó archivo), `400 IMAGEN_INVALIDA` (no es JPG/PNG/WEBP de verdad), `400 SOLICITUD_INVALIDA` (más de 1 archivo, o un campo con otro nombre que `foto`), `413 DEMASIADO_GRANDE` (más de 5 MB).

### `DELETE /usuarios/me/foto` · sesión
Quita la foto. Respuesta: el perfil actualizado.

### `GET /imagenes/usuarios/:id/:archivo` · público
Sirve la foto de perfil (la URL viene en `foto_url`).

### Mis listas

Las tres salen del usuario del **token**: no hay forma de pedir las de otra persona. Sin paginación (una persona tiene pocas). Sin sesión → `401 NO_AUTENTICADO`.

### `GET /usuarios/me/publicaciones` · sesión
Todas mis publicaciones, **en cualquier estado** y aunque estén ocultas por moderación, de la más reciente a la más antigua. Misma forma que una fila de `GET /publicaciones`, más `oculta` y las reclamaciones por revisar:

```json
[
  {
    "id": 41, "tipo": "ENCONTRADO", "estado": "ACTIVA",
    "titulo": "Calculadora Casio encontrada",
    "fecha_suceso": "2026-10-24T15:00:00.000Z", "fecha_creacion": "2026-10-24T16:10:00.000Z",
    "categoria": "Útiles y libros", "sede": "Calle 40 (Ingeniería)", "edificio": "General",
    "ubicacion": "Cuarto piso, al lado de una mesa",
    "miniatura": "/api/imagenes/publicaciones/41/<uuid>_min.webp",
    "oculta": false,
    "reclamaciones_pendientes": 2
  }
]
```

### `GET /usuarios/me/reclamaciones` · sesión
Las reclamaciones que **yo** hice, de la más reciente a la más antigua. No incluye mi `respuesta_detalle`.

```json
[
  {
    "id": 7, "estado": "ACEPTADA", "fecha": "2026-10-25T13:00:00.000Z",
    "publicacion": { "id": 41, "titulo": "Calculadora Casio encontrada", "estado": "EN_RECLAMACION",
                     "usuario": { "id": 12, "nombre": "Ana Pérez" } }
  }
]
```

### `GET /usuarios/me/conversaciones` · sesión
Una fila por reclamación **ACEPTADA** donde soy autor o reclamante (los chats, §10), la de actividad más reciente primero. `contraparte` es siempre la otra persona. `no_leidos` cuenta los mensajes de la otra parte que no he abierto. `ultimo_mensaje` es `null` si nadie ha escrito. También aparecen los chats ya cerrados por la entrega (solo lectura).

```json
[
  {
    "id_reclamacion": 7,
    "publicacion": { "id": 41, "titulo": "Calculadora Casio encontrada", "estado": "EN_RECLAMACION" },
    "contraparte": { "id": 20, "nombre": "Luis Gómez" },
    "ultimo_mensaje": { "contenido": "¿Mañana a las 10?", "fecha_envio": "2026-10-25T15:00:00.000Z" },
    "no_leidos": 1
  }
]
```

---

## 5. Catálogos públicos

### `GET /catalogos` · público
Lo que necesita el formulario de publicar: categorías **activas**, sedes y sus lugares.
```json
{
  "categorias": [
    { "id": 2, "nombre": "Documentos", "icono": "id-card", "sensible": true }
  ],
  "sedes": [
    {
      "id": 1,
      "nombre": "Calle 40 (Ingeniería)",
      "lugares": [{ "id": 3, "edificio": "Biblioteca", "referencia": null, "tipo": "BIBLIOTECA" }]
    }
  ]
}
```
Si la categoría elegida tiene `sensible: true`, el formulario debe mostrar el aviso de la regla 6.6 (tapar números y datos personales en la foto).

---

## 6. Publicaciones: consulta

### `GET /publicaciones` · público
Catálogo con filtros, búsqueda, orden y paginación (RF-13 a RF-16).

| Parámetro | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `tipo` | `PERDIDO` \| `ENCONTRADO` | `ENCONTRADO` | |
| `id_categoria` | entero | `3` | |
| `id_sede` | entero | `1` | |
| `estado` | estado | `ACTIVA` | Por defecto `ACTIVA` |
| `desde`, `hasta` | fecha | `2026-10-01` | Sobre `fecha_suceso` |
| `q` | texto | `calculadora` | Búsqueda en español: encuentra plurales y sin tildes |
| `orden` | `recientes` \| `antiguos` \| `relevancia` | | Por defecto `relevancia` si hay `q`, si no `recientes` |
| `pagina`, `limite` | enteros | `1`, `20` | `limite` máximo 50 |

```json
{
  "datos": [
    {
      "id": 41,
      "tipo": "ENCONTRADO",
      "estado": "ACTIVA",
      "titulo": "Calculadora Casio encontrada",
      "fecha_suceso": "2026-10-24T15:00:00.000Z",
      "fecha_creacion": "2026-10-24T16:10:00.000Z",
      "categoria": "Útiles y libros",
      "sede": "Calle 40 (Ingeniería)",
      "edificio": "General",
      "ubicacion": "Cuarto piso, al lado de una mesa",
      "miniatura": "/api/imagenes/publicaciones/41/<uuid>_min.webp"
    }
  ],
  "total": 1,
  "pagina": 1,
  "limite": 20
}
```
Las publicaciones **ocultas por moderación** nunca aparecen. `miniatura` es `null` si no tiene fotos.
`ubicacion` es el texto de "dónde exactamente"; es `null` en las publicaciones anteriores al 2026-11-24, que solo tienen `edificio`. El frontend muestra `ubicacion` si hay, y si no, `edificio`.
Errores: `400 SOLICITUD_INVALIDA` (con `detalles` por campo).

### `GET /publicaciones/:id` · público
Ficha de detalle (RF-17).
```json
{
  "id": 41,
  "tipo": "ENCONTRADO",
  "estado": "ACTIVA",
  "titulo": "Calculadora Casio encontrada",
  "descripcion": "Calculadora científica gris en una mesa de la biblioteca",
  "fecha_suceso": "2026-10-24T15:00:00.000Z",
  "fecha_creacion": "2026-10-24T16:10:00.000Z",
  "ubicacion": "Cuarto piso, al lado de una mesa",
  "categoria": { "id": 5, "nombre": "Útiles y libros", "sensible": false },
  "lugar": {
    "edificio": "General",
    "referencia": null,
    "sede": { "id": 1, "nombre": "Calle 40 (Ingeniería)" }
  },
  "imagenes": [
    { "url": "/api/imagenes/publicaciones/41/<uuid>.webp", "url_miniatura": "/api/imagenes/publicaciones/41/<uuid>_min.webp", "orden": 1 }
  ],
  "usuario": { "id": 12, "nombre": "Ana Pérez" }
}
```
**Acciones según quién mira:** el frontend compara `usuario.id` con el id de la sesión. Si es el autor, muestra "Editar", "Retirar", "Ver reclamaciones" y "Coincidencias"; si no, "Reclamar" (solo en ENCONTRADO y ACTIVA) y "Reportar". Un visitante ve la ficha completa pero ninguna acción: en su lugar, una invitación a ingresar.
Errores: `404 PUBLICACION_NO_ENCONTRADA` (también si está oculta).

---

## 7. Publicaciones: crear, editar y retirar

### `POST /publicaciones` · sesión
Crear un ENCONTRADO o un PERDIDO (RF-06, RF-07). Las fotos se suben **después**, con `POST /publicaciones/:id/imagenes`.

ENCONTRADO:
```json
{
  "tipo": "ENCONTRADO",
  "titulo": "Calculadora Casio encontrada",
  "descripcion": "Calculadora científica gris en una mesa de la biblioteca",
  "id_categoria": 5,
  "id_sede": 1,
  "ubicacion": "Cuarto piso, al lado de una mesa",
  "fecha_suceso": "2026-10-24T10:00:00-05:00",
  "detalle_reservado": "Tiene un sticker de un gato en la tapa"
}
```
PERDIDO: igual, con `"tipo": "PERDIDO"` y **sin** `detalle_reservado` (si se envía, `400`).

| Campo | Reglas |
|---|---|
| `titulo` | 5 a 100 caracteres |
| `descripcion` | 10 a 2000 caracteres |
| `id_categoria` | Debe existir y estar activa |
| `id_sede` | Debe existir. La publicación queda en el lugar **"General"** de esa sede (se crea solo la primera vez), así coincidencias, estadísticas y el filtro por sede siguen funcionando |
| `ubicacion` | Obligatoria con `id_sede`: 3 a 200 caracteres. Dónde exactamente ("cuarto piso, al lado de una mesa") |
| `id_lugar` | Forma anterior, sigue aceptándose: un lugar del catálogo que debe existir. Se manda `id_sede` **o** `id_lugar`, no los dos (`400`) |
| `fecha_suceso` | No puede estar en el futuro |
| `detalle_reservado` | Solo ENCONTRADO, obligatorio: 3 a 500 caracteres. **Nunca se muestra públicamente** |

Respuesta `201`: la publicación creada (`id`, `tipo`, `titulo`, `descripcion`, `ubicacion`, `estado`, fechas, `categoria`, `lugar`) más `"aviso_sensible": true|false` (regla 6.6).
Si es un ENCONTRADO, el servidor avisa por su cuenta a los autores de PERDIDOS compatibles (RF-24). Si es un PERDIDO, el frontend puede pedir enseguida `GET /publicaciones/:id/coincidencias` (RF-23).
Errores: `400 SOLICITUD_INVALIDA` (incluida la fecha futura, en `detalles`), `401`.

### `PUT /publicaciones/:id` · autor
Editar (RF-10). Mismos campos que crear, todos opcionales (al menos uno). No se cambia el `tipo`. Cambiar `id_sede` mueve la publicación al lugar "General" de la nueva sede.
Errores:
| Código | Estado | Cuándo |
|---|---|---|
| `SOLICITUD_INVALIDA` | 400 | Datos mal formados, y dos casos no obvios: `detalle_reservado` en un PERDIDO, o una `fecha_suceso` posterior a la fecha en que **se creó** la publicación (se compara con `fecha_creacion`, no con "ahora") |
| `PUBLICACION_NO_EDITABLE` | 409 | Está en un estado final: ENTREGADA, EXPIRADA o RETIRADA |
| `DETALLE_BLOQUEADO` | 409 | Ya tiene reclamaciones: el detalle reservado no se puede cambiar |
| `PROHIBIDO` | 403 | No es el autor |
| `PUBLICACION_NO_ENCONTRADA` | 404 | |

### `DELETE /publicaciones/:id` · autor o moderador
**Retira** la publicación (no la borra: pasa a `RETIRADA` y queda en el historial).
Respuesta: `{ "id": 41, "estado": "RETIRADA" }`.
Errores: `409 TRANSICION_INVALIDA` (por ejemplo, si ya está ENTREGADA), `403`, `404`.

---

## 8. Imágenes

### `POST /publicaciones/:id/imagenes` · autor
`multipart/form-data`, campo `imagenes` (uno o varios archivos).
- JPG, PNG o WEBP, **máximo 5 MB** cada una, **máximo 5 por publicación** en total.
- El tipo se revisa por el contenido real del archivo, no por la extensión.
- Se convierten a WEBP (1600 px) y se genera una miniatura (480 px). Se eliminan los metadatos (incluido el GPS).

Respuesta: la lista de imágenes de la publicación (`url`, `url_miniatura`, `orden`).
Errores:
| Código | Estado | Cuándo |
|---|---|---|
| `SIN_IMAGENES` | 400 | No se adjuntó ningún archivo |
| `IMAGEN_INVALIDA` | 400 | No es JPG/PNG/WEBP de verdad (se revisan los bytes) |
| `SOLICITUD_INVALIDA` | 400 | Más de 5 archivos en la misma petición, o un campo con otro nombre que `imagenes` |
| `DEMASIADO_GRANDE` | 413 | Un archivo de más de 5 MB |
| `DEMASIADAS_IMAGENES` | 409 | Con las que ya tiene, pasaría de 5 |
| `PUBLICACION_NO_EDITABLE` | 409 | Está en un estado final |
| `PROHIBIDO` / `PUBLICACION_NO_ENCONTRADA` | 403 / 404 | |

### `DELETE /publicaciones/:id/imagenes/:orden` · autor
Quita la imagen en esa posición (1 a 5). Respuesta: `{ "orden": 2, "borrada": true }`.
Errores: `404 IMAGEN_NO_ENCONTRADA`, `403`, `404`.

### `GET /imagenes/publicaciones/:id/:archivo` · público
Sirve la imagen. Las URL vienen listas en `url` y `url_miniatura`: el frontend las usa tal cual, con `loading="lazy"` (RNF-02). Si la publicación está oculta, `404`.

---

## 9. Coincidencias

### `GET /publicaciones/:id/coincidencias` · autor
Sugerencias para **mi** publicación (RF-23): para un PERDIDO devuelve ENCONTRADOS parecidos (y al revés). Solo las de puntaje **mayor que 50**, de mayor a menor.
```json
[
  {
    "id_publicacion": 41,
    "puntaje": { "categoria": 35, "sede": 20, "tiempo": 25, "texto": 9.1, "total": 89.1 }
  }
]
```
Para mostrar cada sugerencia, el frontend pide `GET /publicaciones/41`.
Cómo se calcula el puntaje: ver la sección 7 de `CLAUDE.md`.
Errores: `403 PROHIBIDO` (si no es el autor o no existe), `401`.

---

## 10. Reclamaciones, chat y entrega

Flujo (§6.2 a §6.5): **reclamar** → el autor **acepta o rechaza** → si acepta, se abre el **chat** → las dos partes **confirman la entrega** → la publicación queda `ENTREGADA`.

### `POST /publicaciones/:id/reclamaciones` · sesión
Reclamar un ENCONTRADO describiendo el detalle reservado (RF-18).
```json
{ "respuesta_detalle": "Tiene un sticker de gato en la tapa", "evidencia_url": "https://…" }
```
`respuesta_detalle`: 3 a 1000 caracteres. `evidencia_url`: opcional, un enlace válido.
Respuesta `201`: `{ "id": 7 }`. Al autor le llega un aviso.
Errores:
| Código | Estado | Cuándo |
|---|---|---|
| `NO_RECLAMABLE` | 409 | Es un PERDIDO, o la publicación ya no está ACTIVA |
| `RECLAMACION_PROPIA` | 409 | Es su propia publicación |
| `RECLAMACION_DUPLICADA` | 409 | Ya tiene una reclamación pendiente sobre esa publicación |
| `PUBLICACION_NO_ENCONTRADA` | 404 | |

### `GET /publicaciones/:id/reclamaciones` · autor
Las reclamaciones de **mi** publicación, junto al detalle reservado, para comparar (RF-19).
```json
{
  "detalle_reservado": "Tiene un sticker de un gato en la tapa",
  "reclamaciones": [
    {
      "id": 7,
      "respuesta_detalle": "Tiene un sticker de gato en la tapa",
      "evidencia_url": null,
      "estado": "PENDIENTE",
      "fecha": "2026-10-25T13:00:00.000Z",
      "fecha_resolucion": null,
      "reclamante": { "id": 20, "nombre": "Luis Gómez" }
    }
  ]
}
```
Errores: `403 PROHIBIDO`.

### `GET /reclamaciones/:id` · partes
Ficha de una reclamación para sus dos partes (autor de la publicación y reclamante), en cualquier estado. Sirve a la pantalla del chat para saber quién es quién y quién ya confirmó la entrega. No incluye la respuesta al detalle reservado.

```json
{
  "id": 7, "estado": "ACEPTADA",
  "fecha": "2026-10-25T13:00:00.000Z", "fecha_resolucion": "2026-10-25T14:00:00.000Z",
  "publicacion": { "id": 41, "titulo": "Calculadora Casio encontrada", "estado": "EN_RECLAMACION" },
  "autor": { "id": 12, "nombre": "Ana Pérez" },
  "reclamante": { "id": 20, "nombre": "Luis Gómez" },
  "soy": "RECLAMANTE",
  "entrega": { "confirmo_autor": true, "confirmo_reclamante": false, "fecha_entrega": null }
}
```

`soy` es `AUTOR` o `RECLAMANTE`. `entrega` es `null` mientras la reclamación no se ha aceptado.
Errores: `403 PROHIBIDO` si no eres parte **o** si no existe (mismo error a propósito, como en el chat).

### `PATCH /reclamaciones/:id` · autor (aceptar o rechazar) · partes (cancelar)
Aceptar o rechazar (RF-19, RF-20), o cancelar una ya aceptada (pregunta 13.4).
```json
{ "decision": "ACEPTAR" }
```
`decision`: `ACEPTAR`, `RECHAZAR` o `CANCELAR`. Respuesta `204` (sin cuerpo).
Al aceptar: la reclamación queda `ACEPTADA`, la publicación pasa a `EN_RECLAMACION`, se abre el chat y se crea la entrega. Las demás reclamaciones pendientes **siguen pendientes**. Al reclamante le llega un aviso.

**Cancelar** (cualquiera de las dos partes, sobre una `ACEPTADA` cuya entrega no se completó, por ejemplo si el reclamante no aparece): la reclamación queda `CANCELADA`, la publicación vuelve a `ACTIVA` (otra vez en el catálogo), el chat se cierra (`409 SIN_CHAT`) y a la otra parte le llega un aviso. Las demás pendientes siguen esperando y la autora puede aceptar otra. Errores propios: `409 SIN_ENTREGA` (no está aceptada), `409 ENTREGA_CERRADA` (la entrega ya se confirmó), `403 PROHIBIDO` (no eres parte).

Errores:
| Código | Estado | Cuándo |
|---|---|---|
| `RECLAMACION_RESUELTA` | 409 | Ya se había aceptado o rechazado |
| `TRANSICION_INVALIDA` | 409 | Al aceptar: la publicación ya no está ACTIVA (otra reclamación ganó) |
| `PROHIBIDO` | 403 | No es el autor (o la reclamación no existe) |

### `GET /reclamaciones/:id/mensajes` · partes
El hilo del chat, del más viejo al más nuevo. Al abrirlo, se marca como leído lo que mandó la otra parte.
```json
[
  {
    "id": 1,
    "contenido": "¿Mañana a las 10 en la biblioteca?",
    "leido": true,
    "fecha_envio": "2026-10-25T15:00:00.000Z",
    "emisor": { "id": 12, "nombre": "Ana Pérez" }
  }
]
```
Errores: `403 PROHIBIDO`, `409 SIN_CHAT` (la reclamación no está aceptada).

### `POST /reclamaciones/:id/mensajes` · partes
```json
{ "contenido": "¡Perfecto, allá nos vemos!" }
```
1 a 2000 caracteres. Respuesta `201`: `{ "id", "contenido", "fecha_envio" }`. A la otra parte le llega un aviso.
Errores: `403 PROHIBIDO`, `409 SIN_CHAT`, `409 CHAT_CERRADO` (la entrega ya se confirmó: el chat queda en solo lectura), `400 MENSAJE_INVALIDO`.

> No hay mensajes en tiempo real (WebSocket): el frontend vuelve a pedir el hilo cada cierto tiempo (por ejemplo, cada 10 s mientras está abierto).

### `POST /reclamaciones/:id/entrega` · partes
Cada parte confirma por separado (RF-21). Sin cuerpo.
```json
{ "entregada": false }
```
`entregada: true` cuando confirmaron **las dos**: la publicación pasa a `ENTREGADA` y a ambas les llega un aviso.
Errores: `409 SIN_ENTREGA` (la reclamación no está aceptada), `409 ENTREGA_CERRADA` (ya se había confirmado), `403 PROHIBIDO`.

---

## 11. Notificaciones

Los avisos se crean solos: reclamación nueva, reclamación aceptada o rechazada, mensaje nuevo, entrega confirmada, coincidencia (RF-24), publicación ocultada por moderación y cuenta suspendida o reactivada. Si la persona tiene `notificar_por_correo: true`, también le llega un correo (con un enlace a la app, nunca con el detalle reservado ni el texto del chat).

### `GET /notificaciones` · sesión
Las 50 más recientes. `?no_leidas=true` para solo las no leídas.
```json
{
  "datos": [
    {
      "id": 31,
      "tipo": "RECLAMACION",
      "mensaje": "Alguien reclamó tu publicación «Calculadora Casio encontrada». Revisa si conoce el detalle reservado.",
      "id_referencia": 41,
      "leida": false,
      "fecha": "2026-10-25T13:00:00.000Z"
    }
  ],
  "no_leidas": 1
}
```
**A dónde lleva cada aviso** (`id_referencia` según el `tipo`):
| `tipo` | `id_referencia` es… | Pantalla sugerida |
|---|---|---|
| `RECLAMACION` | id de la publicación | Reclamaciones de mi publicación |
| `ESTADO` | id de la reclamación (o `null` si es de la cuenta) | El chat o el perfil |
| `MENSAJE` | id de la reclamación | El chat |
| `COINCIDENCIA` | id del ENCONTRADO que coincide | Detalle de esa publicación |
| `MODERACION` | id de la publicación ocultada | Mis publicaciones |

### `PATCH /notificaciones/:id` · sesión
Marcar una como leída. Sin cuerpo. Respuesta `204`.
Errores: `404 NOTIFICACION_NO_ENCONTRADA` (también si es de otra persona).

### `POST /notificaciones/leer-todas` · sesión
Respuesta: `{ "marcadas": 3 }`.

---

## 12. Reportes

### `POST /reportes` · sesión
Reportar una publicación (RF-26).
```json
{ "id_publicacion": 41, "motivo": "La foto muestra el número del documento" }
```
`motivo`: 5 a 500 caracteres. Respuesta `201`: `{ "id": 3 }`.
Errores: `409 REPORTE_PROPIO`, `409 REPORTE_DUPLICADO` (ya tiene uno pendiente sobre esa publicación), `404 PUBLICACION_NO_ENCONTRADA`.

---

## 13. Administración

### Moderación · moderador

#### `GET /admin/reportes`
Bandeja de reportes, los más viejos primero. `?estado=PENDIENTE` (por defecto), `RESUELTO` o `DESCARTADO`.
```json
[
  {
    "id": 3,
    "motivo": "La foto muestra el número del documento",
    "estado": "PENDIENTE",
    "fecha": "2026-10-23T10:00:00.000Z",
    "fecha_resolucion": null,
    "publicacion": { "id": 41, "titulo": "Carné encontrado", "estado": "ACTIVA", "oculta": false },
    "reportante": { "id": 20, "nombre": "Luis Gómez" },
    "horas_pendiente": 51,
    "vencido": true
  }
]
```
`vencido: true` cuando lleva 48 h o más (plazo del moderador).

#### `PATCH /admin/reportes/:id`
```json
{ "decision": "OCULTAR", "motivo": "La foto muestra datos personales" }
```
- `OCULTAR`: oculta la publicación (desaparece del catálogo y del detalle), resuelve **todos** los reportes pendientes de esa publicación y avisa al autor con el motivo.
- `DESCARTAR`: el reporte queda descartado; la publicación sigue visible.

Respuesta `204`. Errores: `409 REPORTE_RESUELTO`, `404 REPORTE_NO_ENCONTRADO`.
Para retirar una publicación del todo: `DELETE /publicaciones/:id` (los moderadores pueden).

### Catálogos · admin (RF-28)
| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| GET | `/admin/categorias` | | Todas, incluidas las inactivas |
| POST | `/admin/categorias` | `{ "nombre", "icono"?, "sensible"? }` | `201` |
| PATCH | `/admin/categorias/:id` | `{ "nombre"?, "icono"?, "sensible"?, "activa"? }` | Las categorías **no se borran**: se desactivan con `activa: false` |
| POST | `/admin/sedes` | `{ "nombre" }` | `201` |
| PATCH | `/admin/sedes/:id` | `{ "nombre" }` | |
| DELETE | `/admin/sedes/:id` | | `204`. Si tiene lugares: `409 EN_USO` |
| POST | `/admin/lugares` | `{ "id_sede", "edificio", "referencia"?, "tipo"? }` | `201`. Sede inexistente: `400 SEDE_NO_EXISTE` |
| PATCH | `/admin/lugares/:id` | `{ "edificio"?, "referencia"?, "tipo"? }` | `tipo`: `BIBLIOTECA`, `CAFETERIA`, `LABORATORIO`, `AUDITORIO`, `AULAS`, `EDIFICIO_PRINCIPAL`, `ADMINISTRATIVO`, `OTRO` o `null`. Da el "edificio análogo" del motor de coincidencias |
| DELETE | `/admin/lugares/:id` | | `204`. Si tiene publicaciones: `409 EN_USO` |

Errores comunes: `409 NOMBRE_REPETIDO`, `404 NO_ENCONTRADO`, `400 SOLICITUD_INVALIDA`.

### Cuentas · admin (RF-29)

#### `GET /admin/usuarios?q=…`
Buscar por nombre (contiene) o por correo **exacto**. Máximo 20 resultados. **No devuelve el correo.**
```json
[
  {
    "id": 20,
    "nombre": "Luis Gómez",
    "programa": "Ingeniería Industrial",
    "rol": "USUARIO",
    "estado_cuenta": "ACTIVA",
    "verificado": true,
    "fecha_registro": "2026-10-20T12:00:00.000Z"
  }
]
```

#### `PATCH /admin/usuarios/:id`
```json
{ "accion": "SUSPENDER", "motivo": "Publicaciones falsas" }
```
`accion`: `SUSPENDER` o `REACTIVAR`. Respuesta: la cuenta actualizada (misma forma que la búsqueda).
Errores: `409 ACCION_SOBRE_SI_MISMO`, `409 SIN_CAMBIO`, `409 CUENTA_ELIMINADA`, `404 USUARIO_NO_ENCONTRADO`.
> La suspensión corta la sesión **al instante**: en la siguiente petición, la persona recibe `401 CUENTA_SUSPENDIDA` aunque su token no haya vencido (el servidor revisa la cuenta en cada petición).

### Estadísticas · admin (RF-30)

#### `GET /admin/estadisticas?desde=2026-01-01&hasta=2026-07-01`
Sin fechas: los últimos 12 meses.
```json
{
  "periodo": { "desde": "2025-10-26T…", "hasta": "2026-10-26T…" },
  "por_mes": [{ "mes": "2026-09", "perdidos": 14, "encontrados": 21 }],
  "recuperacion": { "encontrados": 21, "entregados": 9, "tasa": 0.4286 },
  "categorias_frecuentes": [{ "id": 1, "nombre": "Electrónicos", "total": 12 }],
  "lugares_criticos": [{ "id": 3, "nombre": "Calle 40 (Ingeniería) · Biblioteca", "total": 7 }]
}
```
- Los meses se cuentan en **hora de Colombia**.
- `tasa` está entre 0 y 1 (`null` si no hubo encontrados en el periodo).
- `lugares_criticos` cuenta solo PERDIDOS.

Errores: `400 PERIODO_INVALIDO` (desde ≥ hasta).

---

## 14. Tabla de códigos de error

| Estado | Código | Significado |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA` | Datos mal formados; ver `detalles` |
| 400 | `TOKEN_INVALIDO` / `TOKEN_USADO` / `TOKEN_EXPIRADO` | Enlace de activación o recuperación inválido, ya usado o vencido |
| 400 | `IMAGEN_INVALIDA` / `SIN_IMAGENES` | Archivo que no es JPG/PNG/WEBP de verdad, o no se envió ninguno |
| 400 | `MENSAJE_INVALIDO` | Mensaje vacío o de más de 2000 caracteres |
| 400 | `SEDE_NO_EXISTE` | Crear un lugar en una sede que no existe |
| 400 | `PERIODO_INVALIDO` | Estadísticas con fechas al revés |
| 401 | `NO_AUTENTICADO` | La ruta pide sesión |
| 401 | `SESION_INVALIDA` | Token vencido o alterado |
| 401 | `CREDENCIALES_INVALIDAS` | Correo o contraseña incorrectos |
| 403 | `PROHIBIDO` | Hay sesión, pero no hay permiso (rol, o no es autor / parte) |
| 403 | `CUENTA_NO_VERIFICADA` / `CUENTA_SUSPENDIDA` | Login de una cuenta sin activar o suspendida |
| 404 | `PUBLICACION_NO_ENCONTRADA`, `NOTIFICACION_NO_ENCONTRADA`, `IMAGEN_NO_ENCONTRADA`, `REPORTE_NO_ENCONTRADO`, `USUARIO_NO_ENCONTRADO`, `NO_ENCONTRADO` | No existe (o no es visible para quien pregunta) |
| 409 | `CORREO_REGISTRADO` | Registro con un correo que ya existe |
| 409 | `TRANSICION_INVALIDA` | Cambio de estado no permitido (§6.1) |
| 409 | `PUBLICACION_NO_EDITABLE` / `DETALLE_BLOQUEADO` | Editar algo final, o el detalle de una publicación con reclamaciones |
| 409 | `DEMASIADAS_IMAGENES` | Más de 5 fotos |
| 409 | `NO_RECLAMABLE` / `RECLAMACION_PROPIA` / `RECLAMACION_DUPLICADA` / `RECLAMACION_RESUELTA` | Reglas de reclamación (§6.2) |
| 409 | `SIN_CHAT` / `CHAT_CERRADO` / `SIN_ENTREGA` / `ENTREGA_CERRADA` | Reglas de chat y entrega (§6.4, §6.5) |
| 409 | `REPORTE_PROPIO` / `REPORTE_DUPLICADO` / `REPORTE_RESUELTO` | Reglas de reportes |
| 409 | `NOMBRE_REPETIDO` / `EN_USO` | Catálogos |
| 409 | `ACCION_SOBRE_SI_MISMO` / `SIN_CAMBIO` / `CUENTA_ELIMINADA` | Cuentas |
| 413 | `DEMASIADO_GRANDE` | Cuerpo o archivo demasiado grande (imágenes: más de 5 MB) |
| 423 | `CUENTA_BLOQUEADA` | 5 intentos fallidos: espera 15 minutos |
| 429 | `DEMASIADAS_SOLICITUDES` | Rate limit; ver el encabezado `Retry-After` |
| 500 | `ERROR_INTERNO` | Error inesperado (sin detalles) |
| 503 | `BD_NO_DISPONIBLE` | La base de datos no responde |

---

## 15. Flujos completos

### Registrarse e iniciar sesión
1. `POST /auth/registro` → se envía el correo.
2. La persona abre el enlace → el frontend (`/verificar/:token`) llama a `GET /auth/verificar/:token`.
3. `POST /auth/login` → guardar el `token`.
4. `GET /usuarios/me` para mostrar el perfil.

### Publicar un objeto encontrado (asistente de 3 pasos, RNF-03)
1. Paso 1: `GET /catalogos` para llenar categoría, sede y lugar; si la categoría es `sensible`, mostrar el aviso.
2. Paso 2: título, descripción, fecha y detalle reservado → `POST /publicaciones`.
3. Paso 3: fotos → `POST /publicaciones/:id/imagenes`.

### Publicar un objeto perdido
1. `POST /publicaciones` con `"tipo": "PERDIDO"`.
2. `GET /publicaciones/:id/coincidencias` para mostrar sugerencias de una vez.

### Recuperar un objeto
1. Quien perdió ve un ENCONTRADO → `POST /publicaciones/:id/reclamaciones`.
2. El autor recibe el aviso → `GET /publicaciones/:id/reclamaciones` → `PATCH /reclamaciones/:id` con `ACEPTAR`.
3. Las dos partes conversan: `GET` / `POST /reclamaciones/:id/mensajes`.
4. Al encontrarse, cada una confirma: `POST /reclamaciones/:id/entrega`. Con las dos, `entregada: true`.
