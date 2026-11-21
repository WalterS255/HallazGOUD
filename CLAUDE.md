# CLAUDE.md — HallazGO UD

> **"Lo que se pierde en la U, en la U aparece"**
> Plataforma web de objetos perdidos y encontrados para la Universidad Distrital Francisco José de Caldas.

Este archivo es el contexto permanente del proyecto para Claude Code. Léelo completo antes de proponer o escribir código. Si algo de este archivo deja de ser cierto (una decisión cambia, una fase se termina), **actualízalo en el mismo cambio**.

---

## 0. Cómo trabajar conmigo (léelo primero)

Soy Walter, estudiante de Ingeniería de Sistemas de la Universidad Distrital. Trabajo con datos (SQL, PostgreSQL, Python, Power BI), pero **soy nuevo en desarrollo web**: no conozco todavía Prisma, NestJS, TypeScript ni React a fondo. Este proyecto también es para aprender.

Reglas para Claude Code:

1. **Responde siempre en español**, con lenguaje sencillo y sin tecnicismos innecesarios. Si usas un término técnico, explícalo la primera vez en una frase.
2. **Explica el porqué, no solo el qué.** Quiero entender por qué se hace algo así y cómo detectar yo mismo errores parecidos en el futuro. Cuando algo falle, explica la causa del error antes de dar la corrección.
3. **Pasos pequeños y verificables.** Un módulo o una pieza a la vez. Después de cada paso, ejecuta algo que demuestre que funciona (una prueba, una consulta, un `curl`) y muéstrame el resultado.
4. **Pregunta antes de**: instalar dependencias nuevas, cambiar una decisión de la sección 4, borrar datos o tablas, hacer `prisma migrate reset`, o hacer push. Para lo demás, avanza.
5. **Nunca** pongas contraseñas, tokens o llaves en el código ni en el repositorio. Todo va en `.env` (que está en `.gitignore`) y se documenta en `.env.example`.
6. Si una tarea es grande, primero muéstrame el plan en una lista corta y luego ejecútalo.
7. Al terminar cada fase, marca las casillas del **Plan de trabajo (sección 9)**.

---

## 1. Qué es el proyecto

Hoy en la universidad los objetos perdidos se anuncian en grupos de WhatsApp, redes sociales y carteleras. La información se dispersa, se pierde en minutos, cualquiera puede reclamar algo ajeno y la gente publica su teléfono en canales abiertos.

**HallazGO UD** es una aplicación web (pensada sobre todo para el celular) donde:

- Quien **encuentra** un objeto lo publica con foto, categoría, lugar, fecha y hora, y guarda un **detalle reservado** (un rasgo oculto del objeto).
- Quien **pierde** algo publica su reporte de pérdida.
- El sistema **cruza ambos** y sugiere coincidencias automáticamente.
- Para reclamar, el interesado debe **describir el detalle reservado**. Si el autor del hallazgo lo acepta, se abre un **chat interno** (sin exponer correo ni teléfono).
- La entrega se cierra con **doble confirmación** (las dos partes confirman) y queda auditada.
- Solo se pueden registrar personas con **correo `@udistrital.edu.co`**.

**Documento fuente:** `docs/propuesta/Aplicacion_Web.pdf` (Propuesta Técnica v1.0, 22 de septiembre de 2026). Ante cualquier duda de alcance, manda la propuesta; este archivo resume y concreta.

### 1.1 Incluido en v1.0
- Registro y autenticación con correo institucional (con verificación por correo).
- Publicación de objetos encontrados y perdidos, de 1 a 5 imágenes por publicación.
- Catálogo público con búsqueda por texto, filtros y ordenamiento.
- Reclamación con detalle reservado, chat 1 a 1 y confirmación de entrega.
- Motor de coincidencias.
- Notificaciones dentro de la app y por correo.
- Panel administrativo: moderación, catálogos y estadísticas.

### 1.2 Excluido de v1.0 (no implementar aunque parezca fácil)
- App móvil nativa (la web será responsiva; PWA es trabajo futuro).
- Reconocimiento de imágenes con IA.
- Integración con Cóndor/SIGUD o SSO institucional.
- Custodia física de objetos o bodegas.
- Pagos o recompensas.

---

## 2. Actores y roles

| Actor | Qué puede hacer |
|---|---|
| Visitante (sin sesión) | Ver el catálogo, buscar, filtrar y abrir la ficha de cada objeto (sin datos de contacto ni detalle reservado). **No** puede publicar, reclamar, reportar ni chatear: esas acciones le piden ingresar (decisión 2026-11-21, pregunta 13.5). |
| Usuario registrado | Publicar, buscar, reclamar, conversar, reportar contenido. |
| Autor de hallazgo *(rol contextual)* | Ve y decide (acepta/rechaza) las reclamaciones de su publicación. |
| Autor de pérdida *(rol contextual)* | Recibe sugerencias de coincidencias para su reporte. |
| Moderador | Revisa reportes; oculta o elimina publicaciones; notifica al autor. Plazo: 48 h. |
| Administrador | Gestiona usuarios (suspender/reactivar), categorías, sedes y lugares; ve estadísticas. |

En la base de datos solo existen tres roles fijos: `USUARIO`, `MODERADOR`, `ADMIN`. "Autor de hallazgo" y "autor de pérdida" **no son roles**: se deducen comparando `publicacion.id_usuario` con el usuario de la sesión.

---

## 3. Requerimientos

### 3.1 Funcionales (RF)

**Usuarios y acceso**
- **RF-01** Registro solo con correo `@udistrital.edu.co`; pide nombre, programa/dependencia y contraseña.
- **RF-02** Enlace de activación por correo; la cuenta no opera hasta confirmarlo.
- **RF-03** Login con correo y contraseña; emite un token JWT.
- **RF-04** Recuperación de contraseña con enlace temporal.
- **RF-05** Editar perfil: datos básicos, foto y preferencias de notificación.

**Publicaciones**
- **RF-06** Publicar ENCONTRADO: título, categoría, descripción, sede, lugar, fecha y hora.
- **RF-07** Publicar PERDIDO con los mismos campos (momento y lugar estimados).
- **RF-08** De 1 a 5 imágenes, solo JPG/PNG/WEBP, máximo 5 MB cada una.
- **RF-09** Detalle reservado (solo en ENCONTRADO): nunca se muestra públicamente.
- **RF-10** El autor puede editar o eliminar mientras no haya una entrega confirmada.
- **RF-11** Estados: `ACTIVA`, `EN_RECLAMACION`, `ENTREGADA`, `EXPIRADA`, `RETIRADA`.
- **RF-12** Sin actividad durante 90 días, la publicación pasa a `EXPIRADA` automáticamente.

**Consulta**
- **RF-13** Listado paginado: imagen, título, categoría, lugar, fecha y estado.
- **RF-14** Búsqueda por palabras clave en título y descripción.
- **RF-15** Filtros: tipo, categoría, sede, rango de fechas y estado.
- **RF-16** Orden: más reciente, más antiguo, mayor relevancia.
- **RF-17** Ficha de detalle con galería y acciones según quién la mira.

**Contacto y reclamación**
- **RF-18** Reclamar un ENCONTRADO describiendo el detalle reservado (evidencia opcional).
- **RF-19** El autor acepta o rechaza cada reclamación viendo la respuesta.
- **RF-20** Al aceptar, se habilita un chat privado entre las dos partes.
- **RF-21** Las dos partes confirman la entrega; con la doble confirmación la publicación pasa a `ENTREGADA`.
- **RF-22** Nunca se exponen correo ni teléfono.

**Coincidencias y notificaciones**
- **RF-23** Al crear un PERDIDO, sugerir ENCONTRADOS compatibles (categoría, sede, ±7 días).
- **RF-24** Notificar cuando aparezca una publicación compatible con un reporte.
- **RF-25** Notificar reclamaciones, mensajes y cambios de estado (app y correo).

**Administración**
- **RF-26** Cualquier usuario puede reportar una publicación.
- **RF-27** El moderador revisa, oculta o elimina lo reportado y notifica al autor.
- **RF-28** El admin gestiona categorías, sedes y lugares.
- **RF-29** El admin suspende o reactiva cuentas.
- **RF-30** Estadísticas: publicaciones por mes, tasa de recuperación, categorías más frecuentes y lugares críticos.

### 3.2 No funcionales (RNF) — los que afectan directamente al código

| ID | Qué exige | Cómo se cumple en el código |
|---|---|---|
| RNF-01 | Listado filtrado < 2 s con 10.000 publicaciones y 200 usuarios | Índices de la sección 5.4 + paginación; se valida con k6 |
| RNF-02 | Miniaturas ≤ 200 KB, carga diferida | Sharp genera la miniatura al subir; `loading="lazy"` en el frontend |
| RNF-03 | Publicar en ≤ 4 pasos y ≤ 2 min | Asistente de 3 pasos (sección 7) |
| RNF-04 | Responsivo desde 360 px; el móvil primero | Tailwind, diseño *mobile-first* |
| RNF-05 | WCAG 2.1 AA (contraste, foco visible, etiquetas) | `<label>` en todos los campos, foco visible, revisar contraste |
| RNF-06 | bcrypt con coste ≥ 10 | `bcrypt.hash(pwd, 12)` |
| RNF-07 | HTTPS | En producción, con un proxy inverso con TLS |
| RNF-08 | Validar y sanitizar toda entrada (SQLi, XSS) | Zod en cada endpoint + Prisma (consultas parametrizadas) + React escapa por defecto. Nunca `dangerouslySetInnerHTML` |
| RNF-09 | 5 intentos fallidos / 15 min por cuenta + *rate limit* | Campos `intentos_fallidos` y `bloqueado_hasta` (por cuenta) + `@nestjs/throttler` (por IP: 100/min general, 5/min con `@LimiteEstricto()` en login, registro y recuperación) |
| RNF-10 | Contacto nunca visible para terceros | Selección explícita de campos en repositorios (sección 6.3) |
| RNF-12 | Respaldo diario, 30 días de retención | `pg_dump` programado (fase de despliegue) |
| RNF-13 | Capas + linter | oxlint (con reglas que usan los tipos de TypeScript) + Prettier + estructura de la sección 10 |
| RNF-14 | Cobertura ≥ 60 % en los `*.service.ts` del backend | Vitest con `coverage.thresholds` configurado sobre `src/modules/**/*.service.ts` |
| RNF-15 | Backend sin estado | JWT; nada de sesiones en memoria del servidor. El `SesionGuard` sí consulta la cuenta (estado y rol) en la BD en cada petición con token: suspender corta el acceso al instante |
| RNF-16 | Contenedores | Docker + Docker Compose |
| RNF-18 | Auditoría de acciones críticas | Tabla `auditoria` (inmutable) |
| RNF-19 | Ley 1581 de 2012 | Casilla de consentimiento obligatoria en el registro; borrado de cuenta por anonimización |
| RNF-20 | Español y hora local UTC−5 | Guardar en `timestamptz` (UTC) y mostrar en `America/Bogota` |

---

## 4. Decisiones técnicas ya tomadas

No cambiar sin preguntar.

| Tema | Decisión | Por qué |
|---|---|---|
| Arquitectura | **Monolito modular en capas**, cliente-servidor, API REST | Volumen bajo (decenas de miles de registros); los microservicios serían sobreingeniería |
| Frontend | **Next.js 15** (App Router) + React 19 + Tailwind CSS 4 + TypeScript | **Cambio aprobado (propuesto 2026-11-18 en el PR #1, aprobado 2026-11-21):** antes era React 18 + Vite + React Router. Next.js sigue siendo React, trae el enrutamiento por carpetas (reemplaza a React Router) y un servidor propio que hace de proxy hacia la API: sin CORS y con el JWT en una cookie `httpOnly` que el JavaScript del navegador no puede leer. Las páginas se arman en el servidor, lo que ayuda en celulares lentos (RNF-01, RNF-04). TypeScript, igual que el backend |
| Backend | **NestJS 12 + TypeScript** sobre Node.js 24 LTS (por debajo usa Express 5). ES modules: los `import` locales terminan en `.js` aunque el archivo sea `.ts` | **Cambio (2026-10-25):** antes era Express "a mano". Nest trae de fábrica módulos, inyección de dependencias y capas, que encajan con el monolito modular. TypeScript porque es lo que usan la documentación y la CLI de Nest |
| Validación | Zod, aplicado con un *Pipe* de Nest (no class-validator) | Valida la entrada de cada endpoint con un esquema; el mismo esquema puede reusarse en el frontend |
| ORM | Prisma | Migraciones versionadas y protección contra inyección SQL |
| Base de datos | PostgreSQL 15 o superior; se usa **18** (`postgres:18.6`) | Relacional; tiene búsqueda de texto completo incorporada. La 18 tiene soporte hasta 2030. Los scripts de la Fase A se verificaron en 16 y en 18 |
| Despliegue de la BD | **PostgreSQL en Docker**, tanto en local como en un VPS propio (opción A, 2026-10-25) | Mismo entorno en todos lados; los respaldos (`pg_dump`) los gestionamos nosotros |
| Organización de la BD | **Opción 1: un solo esquema (`public`)**, normalizado | Más fácil para aprender. La Opción 2 (un esquema de Postgres por módulo) queda para después si hace falta |
| Autenticación | JWT + bcrypt | Sin estado, permite escalar |
| Imágenes | Almacenamiento compatible con S3 (**SeaweedFS**, `chrislusf/seaweedfs`, en local y en el VPS) + Sharp | Saca los archivos del servidor y genera miniaturas. **Reemplaza a MinIO (2026-10-25):** MinIO dejó de publicar imágenes Docker gratuitas en oct. 2025 y archivó el proyecto. SeaweedFS es Apache 2.0 y maduro. El backend usa el SDK de S3, así que el proveedor solo se cambia en el `.env` |
| Correo | Nodemailer (**Mailpit en local** para ver los correos sin enviarlos de verdad) | Verificación y notificaciones |
| Tareas programadas | `node-cron` dentro del backend | Expiración a 90 días y limpieza de imágenes |
| Contenedores | Docker + Docker Compose | Mismo entorno en desarrollo y producción |
| Pruebas | **Vitest** + Supertest (backend), React Testing Library (frontend), Playwright (E2E), k6 (carga) | **Cambio (2026-10-25):** la propuesta decía Jest. Nest 12 trae Vitest de fábrica: mismo estilo (`describe`, `it`, `expect`), más rápido y sin problemas con ES modules |
| Linter | **oxlint** + Prettier | **Cambio (2026-10-25):** la propuesta decía ESLint. Nest 12 trae oxlint: mismo propósito, mucho más rápido |
| Versiones | Git + GitHub, ramas `feature/*`, commits con convención semántica (`feat:`, `fix:`, `docs:`…) | Definido en la propuesta |

> **Nota para Claude Code:** antes de instalar, verifica las versiones estables actuales de cada paquete y avísame si alguna cambió algo importante respecto a lo que dice aquí (por ejemplo, cambios de sintaxis en una versión mayor de Prisma o de Tailwind).

---

## 5. Modelo de datos

### 5.1 Qué ya está hecho

Existe un script de aprendizaje en **SQL puro**: `docs/sql/01_tablas_base.sql`. Crea `usuario`, `categoria`, `sede`, `lugar` y `publicacion`, con ENUMs, llaves foráneas, `CHECK`, índices, datos de prueba y una consulta con `JOIN`. Se probó en PostgreSQL 16 y 18 y funciona. Las restricciones rechazaron un correo `@gmail.com`, un usuario inexistente y el valor `'PERDIDOO'`.

**Ruta de aprendizaje acordada:** primero entender las tablas en SQL puro y después pasarlas a Prisma, viendo qué SQL genera Prisma por debajo.

### 5.2 Ajustes respecto al diccionario de la propuesta

Estos ajustes ya se decidieron y mejoran lo que dice la propuesta:

1. **`detalle_reservado` va en su propia tabla 1:1**, no como columna de `publicacion`. Así un `SELECT *` o un `include` descuidado no lo filtra en la API.
2. **`fecha_suceso` + `hora_suceso` se unen** en un solo `timestamptz`. Así la ventana de ±7 días es una resta y se puede indexar.
3. **`sede` es una tabla propia** y `lugar` apunta a ella. El motor compara "misma sede" por `id`, no por texto.
4. **`entrega`** se agrega al diagrama E-R: es una relación 1:1 con `reclamacion`.
5. **`historial_estado`** guarda cada cambio de estado (antes, después, quién y cuándo) para la trazabilidad.
6. **Búsqueda de texto:** una columna `tsvector` generada, en español, sobre título y descripción, con índice GIN.
7. **Índice de coincidencias:** `(tipo, id_categoria, fecha_suceso)`.
8. **Borrado de cuenta (Ley 1581):** se anonimiza al usuario (se borran nombre, correo y foto, y se conserva el `id`) en lugar de eliminar la fila, para no romper la auditoría ni el historial.

### 5.3 Tablas (modelo objetivo)

Convenciones: nombres en español, en `snake_case` y en singular. `id` es la llave primaria (identity). Las llaves foráneas usan el prefijo `id_`. Las fechas son `timestamptz`.

**Catálogos**
- `categoria` (id, nombre UNIQUE, icono, **sensible** bool, activa bool). `sensible = true` para Documentos, Tarjetas y Llaves (ver regla 6.6).
- `sede` (id, nombre UNIQUE).
- `lugar` (id, id_sede → sede, edificio, referencia, **tipo** `tipo_lugar` opcional {BIBLIOTECA, CAFETERIA, LABORATORIO, AUDITORIO, AULAS, EDIFICIO_PRINCIPAL, ADMINISTRATIVO, OTRO}; UNIQUE(id_sede, edificio)). `tipo` da el "edificio análogo" del §7.

**Acceso**
- `usuario` (id, nombre, correo único **sin distinguir mayúsculas** (índice `UNIQUE (lower(correo))`) + CHECK de dominio, hash_contrasena, programa, foto_url, rol `rol_usuario`, verificado, **estado_cuenta** {ACTIVA, SUSPENDIDA, ELIMINADA}, **notificar_por_correo** bool, **intentos_fallidos** int, **bloqueado_hasta** timestamptz, **acepto_politica_en** timestamptz NOT NULL, fecha_registro).
- `token_usuario` (id, id_usuario, tipo {VERIFICACION, RECUPERACION}, **token_hash**, expira_en, usado_en). Se guarda el *hash* del token, nunca el token en claro.

**Publicaciones**
- `publicacion` (id, id_usuario, id_categoria, id_lugar, tipo {PERDIDO, ENCONTRADO}, titulo, descripcion, fecha_suceso, estado, **oculta** bool (moderación), fecha_creacion, **ultima_actividad**, **busqueda** tsvector generado).
- `detalle_reservado` (id_publicacion PK y FK → publicacion, texto). Solo existe para las publicaciones ENCONTRADO.
- `imagen` (id, id_publicacion, url, url_miniatura, orden 1–5; UNIQUE(id_publicacion, orden)).
- `historial_estado` (id, id_publicacion, estado_anterior, estado_nuevo, id_usuario, motivo, fecha).

**Reclamaciones**
- `reclamacion` (id, id_publicacion, id_reclamante, respuesta_detalle, evidencia_url, estado {PENDIENTE, ACEPTADA, RECHAZADA, CANCELADA}, fecha, fecha_resolucion).
  - **Índice único parcial:** solo una `ACEPTADA` por publicación.
  - Único: un mismo usuario no puede tener dos reclamaciones `PENDIENTE` sobre la misma publicación.
- `mensaje` (id, id_reclamacion, id_emisor, contenido, leido, fecha_envio).
- `entrega` (id, id_reclamacion UNIQUE, confirmo_autor, confirmo_reclamante, fecha_entrega).

**Notificaciones, moderación y auditoría**
- `notificacion` (id, id_usuario, tipo {COINCIDENCIA, RECLAMACION, MENSAJE, ESTADO, MODERACION}, mensaje, id_referencia, leida, fecha).
- `reporte` (id, id_publicacion, id_reportante, motivo, estado {PENDIENTE, RESUELTO, DESCARTADO}, id_moderador, fecha, fecha_resolucion).
- `auditoria` (id, id_usuario nullable, accion, entidad, id_entidad, detalle jsonb, ip, fecha). **Inmutable:** un trigger impide `UPDATE` y `DELETE`.

### 5.4 Índices mínimos
- `publicacion (tipo, id_categoria, fecha_suceso)` para coincidencias y filtros.
- `publicacion (estado, fecha_creacion DESC)` para el catálogo.
- `publicacion USING GIN (busqueda)` para la búsqueda de texto.
- Un índice en **cada llave foránea** (PostgreSQL no los crea solo): `publicacion(id_usuario)`, `imagen(id_publicacion)`, `reclamacion(id_publicacion)`, `mensaje(id_reclamacion, fecha_envio)`, `notificacion(id_usuario, leida)`, etc.

### 5.5 Lo que Prisma NO hace solo (importante)

Prisma no sabe expresar algunas cosas en `schema.prisma`. Esas se agregan **a mano en el SQL de una migración**: se crea con `prisma migrate dev --create-only`, se edita el `.sql` generado y luego se aplica.

- Restricciones `CHECK` (dominio del correo, longitud del título, `fecha_suceso <= fecha_creacion`, `orden BETWEEN 1 AND 5`).
- La columna `tsvector` generada (en el schema se declara como `Unsupported("tsvector")`) y su índice GIN.
- ~~Los índices únicos parciales~~ → **ya no**: desde Prisma 7.4 se declaran en el schema con la preview `partialIndexes` (`@@unique([...], where: raw("estado = 'ACEPTADA'"))`).
- La columna generada `busqueda` y su índice GIN **también se repiten en el schema** (`@default(dbgenerated("…"))` con la expresión exacta que guarda Postgres, y `@@index([busqueda], type: Gin)`). Si no se repiten, la siguiente migración intenta borrarlos. **Regla:** después de editar una migración a mano, ejecutar `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; debe decir *"This is an empty migration"*.
- El índice único sobre una expresión `uq_usuario_correo ON usuario (lower(correo))`. Por eso `correo` **no** lleva `@unique` en el schema, y Prisma no permite `findUnique({ where: { correo } })`: el repositorio busca con `findFirst` y el correo ya en minúsculas. Además, el backend guarda siempre el correo con `.trim().toLowerCase()` (la BD es la última barrera, no la única).
- El trigger que vuelve inmutable la `auditoria`.

Cada vez que hagas una de estas, explícame en una frase por qué no pudo ir en el schema.

---

## 6. Reglas de negocio

Estas reglas van en los `*.service.ts` de cada módulo (`backend/src/modules/<modulo>/`), nunca en los controladores ni en el frontend. Cada una necesita su prueba unitaria.

### 6.1 Máquina de estados de una publicación

```
             reclamación aceptada            doble confirmación
  ACTIVA ───────────────────────────► EN_RECLAMACION ───────────────► ENTREGADA (final)
    │  ▲                                    │
    │  └──── reclamación aceptada se ───────┘
    │        cancela o se revierte
    │
    ├── 90 días sin actividad ──► EXPIRADA (cron)
    └── autor o moderador retira ─► RETIRADA
```

- Las transiciones permitidas se definen en **un solo lugar** (un objeto/mapa en el servicio). Cualquier otra transición lanza un error.
- Todo cambio de estado escribe en `historial_estado` y en `auditoria` **dentro de la misma transacción** (`prisma.$transaction`).
- `ENTREGADA`, `EXPIRADA` y `RETIRADA` no se pueden editar (RF-10).
- `ultima_actividad` se actualiza con cada edición, reclamación o mensaje; el cron de expiración la usa.

### 6.2 Reclamaciones
- Solo se reclaman publicaciones `ENCONTRADO` en estado `ACTIVA`.
- El autor no puede reclamar su propia publicación.
- Al **aceptar** una reclamación: esa queda `ACEPTADA`, la publicación pasa a `EN_RECLAMACION`, se crea la fila de `entrega` vacía y se habilita el chat.
- Las demás reclamaciones pendientes siguen `PENDIENTE` (por si la aceptada no resulta).
- **Cancelar una ACEPTADA** (13.4, decidido 2026-11-21): cualquiera de las dos partes, mientras la entrega no se complete (`PATCH /reclamaciones/:id` con `CANCELAR`). La reclamación queda `CANCELADA`, la publicación vuelve a `ACTIVA`, el chat se cierra y se avisa a la otra parte; todo en una transacción. La autora puede aceptar después otra pendiente.

### 6.3 Detalle reservado y datos de contacto (lo más delicado)
- `detalle_reservado` **solo** lo lee el servicio de reclamaciones, y **solo** cuando el que pregunta es el autor de la publicación.
- **Prohibido** usar `include` o `select` sin lista explícita sobre `usuario`. Los repositorios deben devolver siempre un objeto público (`{ id, nombre }`); nunca correo, teléfono, hash ni tokens.
- Debe existir una prueba de integración que recorra **todos** los endpoints públicos y falle si la respuesta contiene `correo`, `hash_contrasena` o `detalle_reservado`.

### 6.4 Chat
- Solo existe si la reclamación está `ACEPTADA`.
- Solo pueden leer y escribir las dos partes: el autor de la publicación y el reclamante.
- Al confirmar la entrega, el chat queda en solo lectura.

### 6.5 Entrega
- Cada parte confirma por separado (`confirmo_autor`, `confirmo_reclamante`).
- Cuando las dos están en `true`: `fecha_entrega = now()` y la publicación pasa a `ENTREGADA`. Todo en una transacción.
- 90 días después de la entrega, un cron borra las imágenes del almacenamiento (retención, sección 12 de la propuesta).

### 6.6 Objetos sensibles
- Si la categoría es `sensible` (documentos, tarjetas, llaves), el formulario muestra un aviso: tapar números y datos personales en la foto y entregar el objeto en la oficina de seguridad de la facultad.
- *(Mejora opcional: aplicar desenfoque automático a la miniatura con Sharp.)*

### 6.7 Seguridad de acceso
- Login: si `bloqueado_hasta > now()`, se rechaza. Cada fallo suma `intentos_fallidos`; al llegar a 5, se bloquea 15 minutos. Un login exitoso reinicia el contador.
- Una cuenta no verificada o `SUSPENDIDA` no puede iniciar sesión.
- Los tokens de verificación y recuperación son aleatorios (`crypto.randomBytes`), de un solo uso y con expiración (24 h para verificación, 1 h para recuperación).
- El mensaje de error de login es siempre genérico ("Correo o contraseña incorrectos"), para no revelar qué correos existen.

---

## 7. Motor de coincidencias (RF-23)

Puntaje ponderado entre un `PERDIDO` y cada `ENCONTRADO` en estado `ACTIVA`:

| Criterio | Peso | Regla |
|---|---|---|
| Misma categoría | 35 % | `id_categoria` igual |
| Misma sede | 20 % | `id_sede` igual → 20 %; *edificio análogo* en otra sede (mismo `lugar.tipo`, que no sea `OTRO` ni vacío) → 10 % |
| Proximidad temporal | 25 % | `25 × (1 − |Δdías| / 7)`; 0 si pasa de 7 días |
| Similitud textual | 20 % | `20 × (palabras del PERDIDO que aparecen en el ENCONTRADO / total de palabras del PERDIDO)`. Las palabras son los lexemas del `tsvector` `busqueda` |

- Se muestran solo las coincidencias con **puntaje > 50**, ordenadas de mayor a menor.
- **Prefiltro en SQL** para no recorrer toda la tabla: mismo `tipo` opuesto, estado `ACTIVA` y `fecha_suceso` dentro de ±7 días. La ponderación se calcula después.
- **Cambio respecto a la propuesta (2026-10-25):** la propuesta pedía `ts_rank` para la similitud textual. Se reemplazó por el porcentaje de palabras en común porque `ts_rank` normalizado nunca pasaba de ~6 de los 20 puntos y casi no distinguía un texto parecido de uno distinto (comparación en `docs/sql/04b_comparar_similitud.sql`). `ts_rank` se sigue usando para ordenar el catálogo por relevancia (RF-16).
- Limitaciones conocidas del porcentaje: el diccionario español junta raíces distintas ("cálculo" y "calculadora" → `calcul`), y las palabras sobre cómo se perdió el objeto ("perdí", "dejé") nunca coinciden, así que el 100 % es casi imposible. Se puede afinar después (por ejemplo, comparar solo el título).
- La función de puntaje es **pura** (recibe dos publicaciones y devuelve un número), así se prueba con Vitest sin base de datos.
- Se ejecuta al crear un `PERDIDO` (devuelve sugerencias) y al crear un `ENCONTRADO` (notifica a los autores de los `PERDIDO` compatibles, RF-24).

---

## 8. API REST

Base: `/api`. Las respuestas van en JSON. Los errores tienen la forma `{ "error": { "codigo": "...", "mensaje": "..." } }`. Los de validación (400 `SOLICITUD_INVALIDA`, del Pipe `ValidacionZod`) agregan `"detalles": [{ "campo": "correo", "mensaje": "..." }]` para que el formulario marque cada campo.

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| POST | `/auth/registro` | público | Crear cuenta |
| GET | `/auth/verificar/:token` | público | Activar cuenta |
| POST | `/auth/login` | público | Emitir JWT |
| POST | `/auth/recuperar` | público | Enviar enlace de recuperación *(añadido, RF-04)* |
| POST | `/auth/restablecer` | público | Nueva contraseña con token *(añadido, RF-04)* |
| POST | `/auth/reenviar-verificacion` | público | Otro enlace de activación *(añadido, RF-02)* |
| GET / PUT | `/usuarios/me` | sesión | Ver o editar mi perfil *(añadido, RF-05)* |
| POST / DELETE | `/usuarios/me/foto` | sesión | Subir (multipart, campo `foto`) o quitar la foto de perfil *(añadido, RF-05)* |
| GET | `/usuarios/me/publicaciones`, `/usuarios/me/reclamaciones`, `/usuarios/me/conversaciones` | sesión | Mis publicaciones (cualquier estado), mis reclamaciones y mis chats *(añadido, para el frontend)* |
| GET | `/imagenes/usuarios/:id/:archivo` | público | Servir una foto de perfil *(añadido)* |
| GET | `/publicaciones` | público | Listar con filtros, búsqueda, orden y paginación |
| POST | `/publicaciones` | sesión | Crear publicación |
| GET | `/publicaciones/:id` | público | Detalle (sin detalle reservado ni contacto) |
| PUT | `/publicaciones/:id` | autor | Editar |
| DELETE | `/publicaciones/:id` | autor / moderador | Retirar (cambia el estado; no borra la fila) |
| POST | `/publicaciones/:id/imagenes` | autor | Subir imágenes (multipart, campo `imagenes`) |
| DELETE | `/publicaciones/:id/imagenes/:orden` | autor | Quitar una imagen *(añadido, RF-10)* |
| GET | `/imagenes/publicaciones/:id/:archivo` | público | Servir una imagen desde el bucket privado *(añadido)* |
| GET | `/publicaciones/:id/coincidencias` | autor | Sugerencias |
| POST | `/publicaciones/:id/reclamaciones` | sesión | Reclamar |
| GET | `/publicaciones/:id/reclamaciones` | autor | Ver reclamaciones de mi publicación *(añadido, RF-19)* |
| GET | `/reclamaciones/:id` | partes | Ficha para el chat: quién es quién (`soy`) y en qué va la entrega *(añadido, para el frontend)* |
| PATCH | `/reclamaciones/:id` | autor / partes | `ACEPTAR` o `RECHAZAR` (autor, sobre una PENDIENTE); `CANCELAR` (cualquiera de las partes, sobre una ACEPTADA sin entrega completa) |
| GET / POST | `/reclamaciones/:id/mensajes` | partes | Hilo de chat |
| POST | `/reclamaciones/:id/entrega` | partes | Confirmar entrega |
| GET | `/notificaciones` | sesión | Mis notificaciones |
| PATCH | `/notificaciones/:id` | sesión | Marcar como leída *(añadido)* |
| POST | `/notificaciones/leer-todas` | sesión | Marcar todas como leídas *(añadido)* |
| GET | `/catalogos` | público | Categorías activas, sedes y lugares para el formulario *(añadido)* |
| GET | `/admin/usuarios?q=` | admin | Buscar cuentas por nombre o correo exacto (sin devolver el correo) *(añadido, RF-29)* |
| POST | `/reportes` | sesión | Reportar contenido |
| GET / PATCH | `/admin/reportes` | moderador | Moderación *(añadido, RF-27)* |
| CRUD | `/admin/categorias`, `/admin/sedes`, `/admin/lugares` | admin | Catálogos *(añadido, RF-28)* |
| PATCH | `/admin/usuarios/:id` | admin | Suspender o reactivar *(añadido, RF-29)* |
| GET | `/admin/estadisticas` | admin | Indicadores |

Las filas marcadas *(añadido)* no están en la tabla 4 de la propuesta, pero las piden los RF indicados.

Paginación: `?pagina=1&limite=20` (límite máximo 50). La respuesta incluye `{ datos, total, pagina, limite }`.

---

## 9. Plan de trabajo

Se respeta el orden de la propuesta (modelo incremental, con un entregable demostrable al final de cada bloque). Marca `[x]` al terminar.

### Fase A — Fundamentos de base de datos (aprendizaje)
- [x] Script SQL con `usuario`, `categoria`, `sede`, `lugar`, `publicacion` (`docs/sql/01_tablas_base.sql`).
- [x] Script `02_reclamaciones.sql`: `detalle_reservado`, `imagen`, `reclamacion`, `mensaje`, `entrega`, con el índice único parcial. Pruebas de datos malos en `02_pruebas_restricciones.sql` (12 casos, todos rechazados).
- [x] Script `03_soporte.sql`: `historial_estado`, `notificacion`, `reporte`, `auditoria` (con trigger de inmutabilidad), `token_usuario`. Pruebas en `03_pruebas_restricciones.sql` (12 casos rechazados + 3 de control).
- [x] Probar a propósito que cada restricción rechaza datos malos, y documentar el error que produce (`01_`, `02_` y `03_pruebas_restricciones.sql`: 40 casos rechazados + controles).
- [x] Practicar la consulta del motor de coincidencias en SQL puro (`04_coincidencias.sql`, con casos de 0, 7 y 8 días).

### Fase B — Andamiaje del repositorio
- [x] Monorepo con `backend/`, `docs/`, `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md` (`frontend/` se crea en la Fase F, cuando empiece el frontend). Las sesiones que trabajen en paralelo usan un `git worktree` en su propia rama `feature/*`, para no pisarse los archivos.
- [x] `docker-compose.yml` con `db` (PostgreSQL 18), `s3` (SeaweedFS, imágenes) y `mailpit` (correos de prueba). Puertos solo en `127.0.0.1`.
- [x] oxlint + Prettier + husky (lint antes de cada commit). `package.json` de la raíz solo con husky + lint-staged; la configuración está en `backend/lint-staged.config.js`. Antes de cada commit: Prettier + oxlint **rápido** (sin tipos); el lint completo con tipos (`npm run lint`, ~23 s) va a mano y en el CI.
- [x] Backend NestJS mínimo con `GET /api/salud` → `{ ok: true }` (Nest 12, TypeScript, módulo `salud`, prueba unitaria + e2e). `multer` forzado a 2.5.0 con `overrides` por una vulnerabilidad en la 2.4.0.
- [x] Filtro global de errores (`comun/errores/`: `{ error: { codigo, mensaje } }`, 500 sin detalles internos, `ErrorApp` para errores de negocio) y logger pino (`comun/logger/`: `X-Request-Id`, redacción de secretos, JSON en producción).

### Fase C — Base de datos con Prisma
- [x] `schema.prisma` con todo el modelo de la sección 5.3 (Prisma 7.10.1, nombres iguales a la BD, cliente en `src/generated/prisma`, URL en `prisma.config.ts`).
- [x] Migración `init` + SQL manual (CHECK, tsvector generado, `lower(correo)`, triggers). Sin diferencias entre schema y BD.
- [x] Comparar con la Fase A: columnas, CHECK, índices y triggers idénticos. Diferencias: Prisma usa `SERIAL` (no `IDENTITY`), `UNIQUE INDEX` (no `CONSTRAINT UNIQUE`) y agrega `ON UPDATE CASCADE` / `ON DELETE RESTRICT o SET NULL` a las FK.
- Bases: `hallazgo_ud` es solo de Prisma; los scripts de la Fase A se practican en `hallazgo_practica`.
- [x] `prisma/seed.ts` con 8 categorías (3 sensibles), 8 sedes de la UD, 22 lugares y 3 usuarios de prueba (uno por rol). Idempotente (`upsert`). Se ejecuta con **tsx**, no con `node`: el cliente generado importa `./client.js` y Node solo quita tipos, no traduce esas rutas. Los usuarios tienen un hash de relleno (`PENDIENTE-FASE-D`) que no deja iniciar sesión hasta tener bcrypt.
- [x] Capa de datos en Nest: `lib/prisma/` (`PrismaModule` global + `PrismaService` con el adaptador pg) y `GET /api/salud/bd` (503 `BD_NO_DISPONIBLE` si la BD no responde; `/api/salud` no toca la BD).
- [x] Pruebas de integración de la BD: `npm run test:db` sobre `hallazgo_test` (se borra y recrea con `migrate deploy` en cada corrida; nunca toca `hallazgo_ud`). Cubre CHECK, `lower(correo)`, únicos parciales, triggers, tsvector y el prefiltro de coincidencias.
- [x] Rendimiento (RNF-01): `docs/sql/05_rendimiento.sql` con 10.000 publicaciones. Catálogo 5,7 ms, búsqueda 4,9 ms (1,4 ms con el GIN), prefiltro 0,04 ms, conteo 1,1 ms. Falta k6 con 200 usuarios (Fase J).
- **Regla de fechas:** si un CHECK compara dos fechas de la misma fila (`fecha` vs `fecha_resolucion`, `fecha_suceso` vs `fecha_creacion`), las dos deben salir del **mismo reloj**. El de Node (Windows) y el del contenedor difieren unos cientos de ms: mezclar `new Date()` con el `DEFAULT now()` de la BD viola el CHECK de forma intermitente. En los servicios: pasar las dos fechas desde Node, o dejar las dos a la BD.

### Fase D — Autenticación (RF-01 a RF-05, RNF-06, RNF-09)
- [x] Piezas base que no usan la BD (rama `feature/fase-d-base`): configuración validada con Zod (`config/configuracion.ts`: el servidor no arranca si falta o está mal una variable; en producción rechaza los valores de ejemplo), Pipe `ValidacionZod` con `detalles` (`comun/validacion/`, mensajes de Zod en español) y rate limit con `@nestjs/throttler` (`comun/limites/`; `/api/salud` exento).
- [x] Piezas de auth sin BD ni dependencias nuevas (`modules/auth/`): esquemas Zod de registro, login, recuperar y restablecer (`auth.schemas.ts`; el límite de 72 **bytes** de bcrypt se cuenta en bytes, no en letras), tokens de un solo uso con `node:crypto` (`tokens.ts`: se guarda solo el SHA-256) y política de bloqueo + orden de decisión del login como funciones puras (`bloqueo.ts`: bloqueo → contraseña → suspendida → sin verificar).
- [x] Registro con validación de dominio y consentimiento obligatorio (`POST /api/auth/registro`; bcrypt con `bcryptjs`, coste de `BCRYPT_COSTE`; correo repetido → 409 `CORREO_REGISTRADO`).
- [x] Verificación por correo, visible en Mailpit (`lib/correo/`: nodemailer; en `NODE_ENV=test` los correos se guardan en memoria; el nombre se escapa en el HTML). `GET /api/auth/verificar/:token`.
- [x] Login con JWT, bloqueo por intentos y rate limit (`POST /api/auth/login`, HS256, `sub` + `rol`). Mismo mensaje si el correo no existe o la clave está mal, y bcrypt corre igual contra un hash falso para que el tiempo no lo delate. Bloqueada → 423, suspendida/sin verificar → 403.
- [x] Recuperación de contraseña (`POST /api/auth/recuperar` responde 202 igual exista o no el correo; `POST /api/auth/restablecer` invalida los demás enlaces y quita el bloqueo).
- [x] *Guards* de Nest para sesión y roles: `SesionGuard` (JWT; sin token = visitante; token malo → 401 `SESION_INVALIDA`) y `RolesGuard`, globales en ese orden. `@Autenticado()`, `@Roles(...)` y `@UsuarioActual()`. `GET /api/usuarios/me`. **Suspensión al instante (decidido 2026-11-21):** el guard consulta `estado_cuenta` y `rol` en la BD en cada petición con token; una cuenta suspendida recibe 401 `CUENTA_SUSPENDIDA` aunque su JWT no haya vencido, y el rol vigente es el de la BD (no el del token). Probado en `admin.db-spec.ts`.
- [x] Pruebas unitarias e integración (`test/db/auth.db-spec.ts`: flujo HTTP completo contra `hallazgo_test`). Los tokens de un solo uso se ocultan también en las URL del log (`ocultarTokens`). El seed toma la contraseña de prueba de `CONTRASENA_SEED` (en el `.env`).
- [x] Editar perfil y reenviar el correo de verificación (`modules/auth/perfil.service.ts`). `PUT /api/usuarios/me` cambia nombre, programa y `notificar_por_correo`; **el correo no se puede cambiar** (es la identidad institucional verificada). Foto de perfil: `POST/DELETE /api/usuarios/me/foto`, cuadrada de 256 px en WEBP sin EXIF (`lib/imagenes/procesar.ts`, compartido con las publicaciones); al reemplazarla se borra la anterior. `POST /api/auth/reenviar-verificacion` responde 202 igual exista o no la cuenta, invalida el enlace anterior y **no reenvía si el último se mandó hace menos de 2 minutos** (freno por cuenta, además del rate limit por IP). Pruebas en `test/db/perfil.db-spec.ts`.

### Fase E — Publicaciones (RF-06 a RF-12)
- [x] CRUD con la máquina de estados y el historial. **Crear, editar y retirar** (`modules/publicaciones/gestion.*`): `POST /publicaciones` (detalle reservado obligatorio en ENCONTRADO y prohibido en PERDIDO; categoría activa y lugar existente; fecha no futura; `fecha_creacion` desde Node; historial `null → ACTIVA`; `aviso_sensible` para la regla 6.6), `PUT /publicaciones/:id` (solo el autor y solo si no es final; **con reclamaciones, el detalle reservado ya no se puede cambiar**: 409 `DETALLE_BLOQUEADO`) y `DELETE /publicaciones/:id` (autor, moderador o admin; pasa por `cambiarEstado(…, 'RETIRADA')`; la fila no se borra). Pruebas HTTP en `test/db/gestion.db-spec.ts`. **Antes:** `modules/publicaciones/estados.ts` (tabla única de transiciones; prueba que recorre las 25 combinaciones) y `PublicacionesService.cambiarEstado` (estado + `historial_estado` + auditoría en una transacción, con `SELECT … FOR UPDATE`). Probado contra la BD: atomicidad (si la auditoría falla, no queda nada) y bloqueo (dos cambios simultáneos: gana uno; sin el `FOR UPDATE` ganaban los dos). `lib/auditoria/` registra con lista cerrada de acciones y recibe el `tx`.
- [x] Subida de imágenes: validación, Sharp (miniatura ≤ 200 KB), SeaweedFS (S3). `modules/publicaciones/imagenes.*` + `lib/almacenamiento/` (SDK de AWS con `forcePathStyle`; en `NODE_ENV=test`, en memoria; crea el bucket en desarrollo si falta). El tipo real se revisa por los **bytes** con `file-type` (no por la extensión); todo se reconvierte a WEBP (1600 px y miniatura de 480 px) y **se pierden los metadatos EXIF, incluido el GPS**. Máximo 5 por publicación con `FOR UPDATE`; si algo falla después de subir a S3, se borran los archivos (S3 no participa de la transacción). El bucket es privado: las imágenes se sirven por `GET /api/imagenes/…`, que no muestra las de publicaciones ocultas. Pendiente: el desenfoque opcional de la regla 6.6 (las fotos ya son obligatorias también en PERDIDO, 13.6).
- [x] Detalle reservado protegido + prueba anti-fuga (6.3). `test/db/api.db-spec.ts` guarda **todas** las respuestas del flujo completo y al final falla si alguna trae `correo`, `hash_contrasena`, `token_hash` o el detalle reservado (salvo `GET /publicaciones/:id/reclamaciones` para la autora).
- [ ] Cron de expiración a 90 días. **Lógica lista:** `jobs/expiracion.service.ts` (`expirarInactivas`: ACTIVAS con `ultima_actividad < now() - 90 días`, en lotes de 500, una transacción por publicación vía `cambiarEstado`; cuenta como "omitida" la que otra petición cambió antes). Probado con 89, 91 y 200 días y con una EN_RECLAMACION quieta (esa no expira). **Falta:** el programador diario (`node-cron` o `@nestjs/schedule`): dependencia nueva, pendiente de aprobar.

### Fase F — Consulta (RF-13 a RF-17) · *Hito: demostración funcional*
- [x] Listado con filtros combinados, búsqueda de texto, orden por relevancia y paginación. `GET /api/publicaciones` (público, `?…` validado con Zod) y `GET /api/publicaciones/:id` sobre `CatalogoService` (Prisma.sql parametrizado, lista cerrada de campos públicos). Visitante (13.5, resuelta): ve catálogo, búsqueda y ficha completos; las acciones le piden ingresar (frontend: `usuarioOLogin` y aviso en la ficha; backend: 401 en toda escritura).
- [x] Frontend: Inicio, Catálogo, Detalle y asistente de publicación en 3 pasos (Next.js, `frontend/`).
- [x] **Hito:** un usuario puede publicar y encontrar un objeto de punta a punta. Recorrido hecho en el navegador a 340 px (2026-11-21): publicar con foto → buscar → reclamar → aceptar → chatear → doble confirmación → ENTREGADA, con avisos en la app y por correo. Arreglado en ese recorrido: el chat leía mal quién ya confirmó (ahora usa `GET /reclamaciones/:id`) y el texto oculto "sin leer" del menú estiraba la página en el celular (`.nav { position: relative }`).

### Fase G — Reclamación, chat y entrega (RF-18 a RF-22)
- [x] Reclamar, aceptar o rechazar, chat y doble confirmación. Rutas: `POST/GET /api/publicaciones/:id/reclamaciones`, `PATCH /api/reclamaciones/:id`, `GET/POST /api/reclamaciones/:id/mensajes`, `POST /api/reclamaciones/:id/entrega`. Servicios en `modules/reclamaciones/`:
  - `crear` aplica las reglas de §6.2 y traduce el choque con el índice único parcial a `RECLAMACION_DUPLICADA`.
  - `paraElAutor` es el único lugar que lee `detalle_reservado`.
  - `resolver` hace todo en una transacción: reclamación + `cambiarEstadoEn` + entrega vacía + auditoría.
  - `confirmarEntrega` guarda las dos marcas y `fecha_entrega` en un solo `UPDATE`.
  - Bloqueos `FOR UPDATE` en la reclamación y la entrega. Probado: dos aceptaciones simultáneas (gana una y la otra se deshace entera) y dos confirmaciones simultáneas (sin los bloqueos la entrega quedaba abierta para siempre).
  - Chat (`MensajesService`): solo con la reclamación `ACEPTADA` y solo las dos partes; al abrir el hilo se marca como leído lo de la otra parte; solo lectura después de la entrega.
  - Cancelar una reclamación aceptada (13.4): `ReclamacionesService.cancelar` + botón en el chat con doble confirmación. Probado en `api.db-spec.ts`.
- [x] Frontend: Mis publicaciones y Mensajes. **Backend:** `modules/mi-cuenta/` con `GET /api/usuarios/me/publicaciones`, `/reclamaciones` y `/conversaciones` (todo sale del id del token; `contraparte` siempre es la otra parte; `no_leidos` = mensajes de la otra parte sin abrir). Probado en `api.db-spec.ts`, dentro de la revisión anti-fuga.

### Fase H — Coincidencias y notificaciones (RF-23 a RF-25)
- [x] Función de puntaje pura + pruebas con casos límite (día 0, día 7, día 8). `modules/coincidencias/`: `puntaje.ts` (pura), repositorio con el prefiltro SQL y servicio que sirve en los dos sentidos. Endpoint `GET /api/publicaciones/:id/coincidencias` **solo para el autor** (`sugerenciasParaAutor`; antes cualquiera con sesión podía ver las de otros). **RF-24:** al crear un ENCONTRADO, `GestionService.crear` llama a `alPublicarEncontrado` después de la transacción (nunca lanza): un aviso por autor de PERDIDO compatible.
- [x] Notificaciones en la app y por correo (respetando `notificar_por_correo`). `modules/notificaciones/`: `avisar()` se llama **después** de la transacción y **nunca lanza** (un aviso fallido no deshace la acción); no escribe a cuentas suspendidas; no repite el correo si ya hay uno igual sin leer. Avisos: reclamación, aceptada/rechazada, mensaje, entrega, coincidencia (RF-24), moderación y cuenta. Los avisos y correos nunca llevan el detalle reservado ni el texto del chat.

### Fase I — Administración (RF-26 a RF-30) · *Hito: alcance completo*
- [x] Reportes y moderación (`modules/moderacion/`): `POST /reportes` (duplicado pendiente → `REPORTE_DUPLICADO` por el índice parcial), bandeja con `horas_pendiente` y `vencido` (48 h), `OCULTAR` cierra todos los pendientes de esa publicación y avisa a la autora; `FOR UPDATE` contra dos moderadores a la vez.
- [x] CRUD de catálogos y suspensión de usuarios (`modules/admin/catalogos.*`, `usuarios-admin.service.ts`): las categorías se **desactivan** (no se borran); sede o lugar en uso → 409 `EN_USO`; buscar cuentas por nombre o correo exacto **sin devolver el correo**; suspender/reactivar con auditoría. Suspender corta la sesión al instante (ver Fase D).
- [x] Estadísticas (consultas de agregación). `GET /api/admin/estadisticas` (`@Roles('ADMIN')`, `?desde&hasta`) sobre `modules/admin/estadisticas.*`: por mes en **hora de Colombia** (probado con el 31 de enero a las 22:00), tasa de recuperación, categorías frecuentes y lugares críticos.

### Fase J — Pruebas y calidad
- [ ] Cobertura ≥ 60 % en los `*.service.ts` del backend (Vitest).
- [ ] Playwright: publicar → reclamar → conversar → entregar.
- [ ] k6 con 200 usuarios virtuales sobre el listado (RNF-01).
- [ ] OWASP ZAP + revisión manual de control de acceso.
- [ ] Revisión de accesibilidad (WCAG AA) y del responsivo a 360 px.

### Fase K — Despliegue y documentación
- [ ] Dockerfiles de producción + proxy inverso con TLS. En el VPS no se publican los puertos de Postgres, ni el explorador de SeaweedFS (8888, sin contraseña), ni Mailpit. **IP real para el rate limit (hecho):** backend con `TRUST_PROXY=1` (el salto es Next) y frontend con `CONFIAR_PROXY=true` en producción, para que tome la IP que el proxy agrega al final de `X-Forwarded-For`. Sin eso, todos comparten el mismo límite; con un salto de más, cualquiera inventa su IP (ver `comun/limites/limites.ts`, probado en `test/limites.e2e-spec.ts`).
- [ ] Usuario de BD con permisos mínimos. **Script listo y probado:** `infra/bd/roles.sql` crea `hallazgo_app`, que lee y escribe datos, pero en `auditoria` solo puede hacer `INSERT` y `SELECT`. Tampoco puede hacer `DROP`, desactivar triggers ni crear tablas, y las tablas de migraciones futuras heredan sus permisos. Falta: en producción el backend usa `hallazgo_app` y solo `prisma migrate deploy` y los respaldos usan el dueño. Eso requiere separar las dos URL en la configuración.
- [ ] CI en GitHub Actions: lint + pruebas en cada PR.
- [ ] Respaldo diario con `pg_dump` (30 días) + prueba de restauración. **Scripts listos y probados** (`infra/respaldo/respaldar.sh` y `restaurar.sh`: misma cantidad de filas, triggers, CHECK e índices). Falta programar el cron en el VPS y guardar una copia fuera del servidor.
- [ ] Documentación: arquitectura, modelo de datos, API, manual de usuario y manual de administrador. **Técnica lista** en `docs/` (`api.md`, `arquitectura.md`, `modelo-datos.md` + `.puml`, `pendientes.md`). Faltan los manuales de usuario y de administrador (cuando exista el frontend).

---

## 10. Estructura de carpetas objetivo

```
hallazgo-ud/
├── CLAUDE.md                  ← este archivo
├── README.md                  ← cómo levantar el proyecto
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── propuesta/Aplicacion_Web.pdf
│   ├── sql/                   ← scripts de aprendizaje (Fase A)
│   └── api.md
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── main.ts            ← arranca el servidor
│   │   ├── app.module.ts      ← módulo raíz: solo importa los módulos
│   │   ├── configurar-app.ts  ← prefijo /api y ajustes globales (lo usan main.ts y las pruebas e2e)
│   │   ├── config/            ← lectura y validación de variables de entorno
│   │   ├── modules/
│   │   │   ├── salud/         ← GET /api/salud
│   │   │   ├── auth/          ← auth.module.ts, auth.controller.ts, auth.service.ts, auth.repository.ts, auth.schemas.ts, auth.service.spec.ts
│   │   │   ├── publicaciones/
│   │   │   ├── reclamaciones/
│   │   │   ├── notificaciones/
│   │   │   ├── coincidencias/
│   │   │   ├── moderacion/
│   │   │   ├── mi-cuenta/     ← GET /api/usuarios/me/publicaciones, /reclamaciones, /conversaciones
│   │   │   └── admin/
│   │   ├── comun/             ← guards (sesión, roles), pipes (Zod), filtros de errores, interceptores
│   │   ├── jobs/              ← tareas cron
│   │   └── lib/               ← prisma, mailer, almacenamiento, auditoría (como providers de Nest)
│   └── test/                  ← pruebas e2e (*.e2e-spec.ts); las unitarias van junto al archivo (*.spec.ts)
└── frontend/                  ← Next.js 15 (App Router); detalle en frontend/README.md
    ├── docs/                  ← endpoints que pide el frontend, temas a decidir
    └── src/
        ├── app/               ← cada carpeta es una ruta (page.tsx); api/[...ruta]/ es el proxy hacia el backend
        ├── components/        ← componentes ('use client' = interactivos en el navegador)
        └── lib/               ← api/ (servidor.ts y cliente.ts), tipos.ts, sesion.ts, ip-cliente.ts, entrega.ts…
```

> **Ojo con `'use client'` (Next.js):** una página del servidor no puede llamar funciones de un archivo marcado `'use client'`. La lógica compartida va en `src/lib/`.

> La propuesta agrupa por capa (`routes/`, `services/`, `repositories/`). Aquí se agrupa **por módulo y dentro de cada uno por capa**, porque refleja mejor el "monolito modular" y facilita extraer un módulo después. Las capas siguen siendo las mismas.

**Regla de capas:** `controller` → llama a `service` → llama a `repository` → usa Prisma. Un controlador nunca usa Prisma directamente ni contiene reglas de negocio, y un repositorio nunca contiene reglas de negocio. Cada pieza se "inyecta" en la siguiente por el constructor (inyección de dependencias de Nest), lo que permite reemplazarla por una falsa en las pruebas.

---

## 11. Variables de entorno (`.env.example`)

La lista completa y actualizada vive en **`.env.example`** (en la raíz). No se copia aquí para que no queden dos versiones distintas.

- `docker-compose.yml` lee el mismo `.env`: `POSTGRES_*` para la base de datos y `S3_ACCESS_KEY` / `S3_SECRET_KEY` como llaves de SeaweedFS.
- Si Postgres ya está instalado en Windows y ocupa el 5432, se usa `POSTGRES_PORT=5433` y el mismo puerto en `DATABASE_URL` (es el caso del PC de Walter).
- Puertos locales: Postgres `5433`, S3 `8333`, explorador de SeaweedFS `8888`, Mailpit SMTP `1025` y web `8025`.

---

## 12. Comandos útiles (se completan a medida que existan)

```bash
docker compose up -d                 # levanta db, s3 (SeaweedFS) y mailpit
docker compose ps                    # estado de los servicios
docker compose exec db createdb -U hallazgo hallazgo_practica                               # BD aparte para la práctica (una vez)
docker compose exec db psql -U hallazgo -d hallazgo_practica -f /sql/01_tablas_base.sql     # scripts de la Fase A: NUNCA sobre hallazgo_ud (borran tablas de la app)
cd backend && npm run start:dev      # backend Nest en modo desarrollo (se reinicia al guardar)
npm run test:e2e                     # pruebas de punta a punta del backend
npm run build                        # compila TypeScript a dist/
npm run db:migrate -- --name <nombre>   # nueva migración (es interactivo si detecta cambios: ejecútalo tú en una terminal)
npx prisma migrate dev --create-only --name <nombre>   # para editar el SQL a mano
npm run db:studio                    # ver los datos en el navegador
npm run db:seed                      # datos iniciales (se puede repetir sin duplicar)
npm run db:status                    # qué migraciones están aplicadas
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # debe salir vacío
npm test                             # pruebas unitarias (sin BD)
npm run test:db                      # pruebas contra PostgreSQL: cada corrida crea y borra su propia BD (hallazgo_test_<carpeta>_<pid>)
bash infra/respaldo/respaldar.sh     # (desde la raíz) respaldo de hallazgo_ud en respaldos/
bash infra/respaldo/restaurar.sh respaldos/<archivo>.dump   # restaura en hallazgo_restaurada para comprobarlo
npm run lint                         # lint completo con tipos (~23 s)
npm run format:check                 # ¿todo está formateado? (no cambia nada)
npm install                          # en la RAÍZ: instala husky y activa el hook de pre-commit
cd frontend && npm run dev           # frontend (Next.js) en http://localhost:3001
cd frontend && npm run typecheck     # revisión de tipos del frontend
cd frontend && npm run build         # compilación de producción. APAGA antes `npm run dev`: los dos usan .next/
                                     # y se pisan (el dev responde 500). Si pasa: borrar frontend/.next y reiniciar
```

---

## 13. Preguntas abiertas (resolver con Walter antes de implementar esa parte)

1. ~~**PERDIDO sin flujo de contacto.**~~ **Resuelta (2026-11-21):** en la ficha de un PERDIDO, el botón "¡Lo tengo!" abre el asistente de ENCONTRADO con categoría, título y lugar copiados (`/publicar?lo_tengo=<id>`); al publicar, el motor de coincidencias le avisa al dueño (RF-24).
2. ~~**"Edificio análogo".**~~ **Resuelta (2026-11-21):** columna `lugar.tipo` (enum `tipo_lugar`); misma clase en otra sede = 10 puntos (`puntaje.ts`, `esAnalogo`). La migración `tipo_lugar` clasifica los lugares existentes por su nombre.
3. ~~**¿Quién publica lo que llega a portería?**~~ **Resuelta (2026-11-21):** una cuenta normal con correo institucional; sin rol propio.
4. ~~**Revertir una reclamación aceptada.**~~ **Resuelta (2026-11-21):** sí, cualquiera de las partes puede cancelarla (ver §6.2).
5. ~~**Visitante "lectura limitada".**~~ **Resuelta (2026-11-21):** el visitante ve el catálogo, busca y abre la ficha completa (sin contacto ni detalle reservado), pero no publica, reclama, reporta ni chatea: esas acciones le piden ingresar. Ver sección 2.
6. ~~**Imágenes en publicaciones PERDIDO.**~~ **Resuelta (2026-11-21):** obligatorias también (al menos una). El asistente sugiere subir la foto de uno igual o parecido. Se exige en el frontend: el backend crea la publicación y recibe las fotos en un segundo paso.
7. ~~**`fecha_suceso` con el reloj del celular.**~~ **Resuelta (2026-11-21):** hasta 10 minutos en el futuro se toma como "ahora"; más que eso se rechaza (`publicaciones/fecha-suceso.ts`). Todo se guarda en UTC y se muestra en hora de Colombia.

---

## 14. Fuera de alcance / trabajo futuro (no implementar en v1)

PWA con notificaciones push · reconocimiento de imágenes · mapa interactivo del campus · SSO institucional · módulo de custodia en portería con código de retiro · sistema de reputación · tablero analítico avanzado.
