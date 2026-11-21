# Endpoints que el frontend necesita

Lo que el frontend usa y el backend todavía no tiene, con la respuesta que espera. Los nombres siguen
las convenciones de `docs/api.md` (snake_case, `{ id, nombre }` para otras personas, errores
`{ error: { codigo, mensaje } }`). El frontend ya llama a estas rutas: mientras respondan `404`,
la pantalla muestra un aviso "Pendiente en el backend" en lugar de fallar.

## Necesarios

> ✅ **Los tres ya existen en el backend** (módulo `mi-cuenta`, documentados en `docs/api.md` §4 "Mis listas").
> Diferencia con lo pedido: `GET /usuarios/me/publicaciones` trae además `oculta` (si moderación la ocultó).

### 1. `GET /usuarios/me/publicaciones` · sesión

Pantalla **Mis publicaciones**. Ya está anotado en `docs/pendientes.md` §3.

Todas las publicaciones del usuario, **en cualquier estado** (también RETIRADA, EXPIRADA y ocultas),
de la más reciente a la más antigua. Misma forma que una fila de `GET /publicaciones`, más el número de
reclamaciones pendientes:

```json
[
  {
    "id": 41,
    "tipo": "ENCONTRADO",
    "estado": "ACTIVA",
    "titulo": "Calculadora Casio encontrada",
    "fecha_suceso": "2026-10-24T15:00:00.000Z",
    "fecha_creacion": "2026-10-24T16:10:00.000Z",
    "categoria": "Útiles y libros",
    "sede": "Calle 40 (Ingeniería)",
    "edificio": "Biblioteca",
    "miniatura": "/api/imagenes/publicaciones/41/<uuid>_min.webp",
    "reclamaciones_pendientes": 2
  }
]
```

### 2. `GET /usuarios/me/reclamaciones` · sesión

Pantalla **Mis publicaciones** (sección "Mis reclamaciones") y **detalle** de una publicación: ahí el
frontend necesita saber si la persona ya reclamó ese objeto, para mostrar el estado en vez del
formulario (hoy sólo se entera al recibir `409 RECLAMACION_DUPLICADA`).

```json
[
  {
    "id": 7,
    "estado": "ACEPTADA",
    "fecha": "2026-10-25T13:00:00.000Z",
    "publicacion": { "id": 41, "titulo": "Calculadora Casio encontrada", "estado": "EN_RECLAMACION", "usuario": { "id": 12, "nombre": "Ana Pérez" } }
  }
]
```

### 3. `GET /usuarios/me/conversaciones` · sesión

Pantalla **Mensajes** (lista de chats). Una fila por reclamación **ACEPTADA** donde la persona es el
autor o el reclamante, la de actividad más reciente primero:

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

## Recomendados

> ✅ **#4 hecho:** `GET /reclamaciones/:id` (`docs/api.md` §10). Trae además `soy` (`AUTOR` o `RECLAMANTE`) y `fecha`/`fecha_resolucion`; `entrega` es `null` si la reclamación no está aceptada.
> ✅ **#6 hecho, con un cambio en el frontend:** el backend usa `TRUST_PROXY=1`. Reenviar el `X-Forwarded-For` del navegador tal cual dejaba **inventar la IP** (probado: 7 logins seguidos con IPs inventadas pasaban todos). Ahora `src/lib/ip-cliente.ts` solo reenvía la IP cuando `CONFIAR_PROXY=true` (hay un proxy inverso delante, en producción) y toma la última entrada, la que puso ese proxy.

| # | Qué | Para qué |
| - | --- | -------- |
| 4 | `GET /reclamaciones/:id` (partes): `{ id, estado, publicacion: { id, titulo, estado }, autor, reclamante, entrega: { confirmo_autor, confirmo_reclamante, fecha_entrega } }` | El chat no puede saber quién ya confirmó la entrega: si alguien recarga la página, el botón "Confirmar" vuelve a aparecer. Hoy el frontend arma el encabezado del chat con la publicación que viene en el enlace |
| 5 | `id_referencia` de los avisos `MENSAJE` y `ESTADO` con el id de la publicación además del de la reclamación (por ejemplo `id_publicacion`) | Que el enlace del aviso abra el chat con el título del objeto |
| 6 | Activar `app.set('trust proxy', 1)` y leer `X-Forwarded-For` | El frontend reenvía todas las peticiones desde su servidor: sin esto, el límite de 100 peticiones por minuto se reparte entre **todos** los usuarios. El frontend ya envía `X-Forwarded-For` con la IP real |
| 7 | La ruta para cancelar una reclamación aceptada (`docs/pendientes.md` #4) | El frontend agregaría el botón en el chat |

## Cómo comprobarlo

Con el backend y el frontend encendidos, abre `http://localhost:3001/estado`: las tres pruebas marcadas
"(pendiente)" pasan de `404` a `200` o `401` cuando el endpoint existe.
