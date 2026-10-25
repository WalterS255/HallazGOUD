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
| Visitante (sin sesión) | Ver el catálogo en modo lectura limitada, sin datos de contacto. |
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
| RNF-15 | Backend sin estado | JWT; nada de sesiones en memoria del servidor |
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
| Frontend | React 18 + Vite + Tailwind CSS + React Router | Ecosistema maduro y diseño responsivo rápido |
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
- `lugar` (id, id_sede → sede, edificio, referencia; UNIQUE(id_sede, edificio)).

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
| Misma sede | 20 % | `id_sede` igual → 20 %; *edificio análogo* en otra sede → 10 % |
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
| GET / PUT | `/usuarios/me` | sesión | Ver o editar mi perfil *(añadido, RF-05)* |
| GET | `/publicaciones` | público | Listar con filtros, búsqueda, orden y paginación |
| POST | `/publicaciones` | sesión | Crear publicación |
| GET | `/publicaciones/:id` | público | Detalle (sin detalle reservado ni contacto) |
| PUT | `/publicaciones/:id` | autor | Editar |
| DELETE | `/publicaciones/:id` | autor / moderador | Retirar (cambia el estado; no borra la fila) |
| POST | `/publicaciones/:id/imagenes` | autor | Subir imágenes (multipart) |
| GET | `/publicaciones/:id/coincidencias` | autor | Sugerencias |
| POST | `/publicaciones/:id/reclamaciones` | sesión | Reclamar |
| GET | `/publicaciones/:id/reclamaciones` | autor | Ver reclamaciones de mi publicación *(añadido, RF-19)* |
| PATCH | `/reclamaciones/:id` | autor | Aceptar o rechazar |
| GET / POST | `/reclamaciones/:id/mensajes` | partes | Hilo de chat |
| POST | `/reclamaciones/:id/entrega` | partes | Confirmar entrega |
| GET | `/notificaciones` | sesión | Mis notificaciones |
| PATCH | `/notificaciones/:id` | sesión | Marcar como leída *(añadido)* |
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
- [ ] `prisma/seed.ts` con categorías, sedes de la UD, lugares y 2–3 usuarios de prueba (uno por rol).

### Fase D — Autenticación (RF-01 a RF-05, RNF-06, RNF-09)
- [x] Piezas base que no usan la BD (rama `feature/fase-d-base`): configuración validada con Zod (`config/configuracion.ts`: el servidor no arranca si falta o está mal una variable; en producción rechaza los valores de ejemplo), Pipe `ValidacionZod` con `detalles` (`comun/validacion/`, mensajes de Zod en español) y rate limit con `@nestjs/throttler` (`comun/limites/`; `/api/salud` exento).
- [x] Piezas de auth sin BD ni dependencias nuevas (`modules/auth/`): esquemas Zod de registro, login, recuperar y restablecer (`auth.schemas.ts`; el límite de 72 **bytes** de bcrypt se cuenta en bytes, no en letras), tokens de un solo uso con `node:crypto` (`tokens.ts`: se guarda solo el SHA-256) y política de bloqueo + orden de decisión del login como funciones puras (`bloqueo.ts`: bloqueo → contraseña → suspendida → sin verificar).
- [ ] Registro con validación de dominio y consentimiento obligatorio.
- [ ] Verificación por correo (visible en Mailpit).
- [ ] Login con JWT, bloqueo por intentos y rate limit.
- [ ] Recuperación de contraseña.
- [ ] *Guards* de Nest para sesión y roles (`@Roles('ADMIN')`).
- [ ] Pruebas unitarias e integración.

### Fase E — Publicaciones (RF-06 a RF-12)
- [x] Máquina de estados pura (`modules/publicaciones/estados.ts`): `aplicarEvento(estado, evento)` con las 5 transiciones del diagrama 6.1; las otras 20 combinaciones lanzan 409 `TRANSICION_INVALIDA`. `REVERTIR_RECLAMACION` asume la pregunta abierta 13.4.
- [ ] CRUD con la máquina de estados y el historial.
- [ ] Subida de imágenes: validación, Sharp (miniatura ≤ 200 KB), SeaweedFS (S3).
- [ ] Detalle reservado protegido + prueba anti-fuga (6.3).
- [ ] Cron de expiración a 90 días.

### Fase F — Consulta (RF-13 a RF-17) · *Hito: demostración funcional*
- [ ] Listado con filtros combinados, búsqueda de texto, orden por relevancia y paginación.
- [ ] Frontend: Inicio, Catálogo, Detalle y asistente de publicación en 3 pasos.
- [ ] **Hito:** un usuario puede publicar y encontrar un objeto de punta a punta.

### Fase G — Reclamación, chat y entrega (RF-18 a RF-22)
- [ ] Reclamar, aceptar o rechazar, chat y doble confirmación.
- [ ] Frontend: Mis publicaciones y Mensajes.

### Fase H — Coincidencias y notificaciones (RF-23 a RF-25)
- [x] Función de puntaje pura + pruebas con casos límite (día 0, día 7, día 8) (`modules/coincidencias/puntaje.ts`). Da los mismos puntajes que `docs/sql/04_coincidencias.sql` (89,1 · 58,6 · 54,7 · 43,2). Falta el "edificio análogo" (pregunta 13.2).
- [ ] Notificaciones en la app y por correo (respetando `notificar_por_correo`).

### Fase I — Administración (RF-26 a RF-30) · *Hito: alcance completo*
- [ ] Reportes y moderación.
- [ ] CRUD de catálogos y suspensión de usuarios.
- [ ] Estadísticas (consultas de agregación).

### Fase J — Pruebas y calidad
- [ ] Cobertura ≥ 60 % en los `*.service.ts` del backend (Vitest).
- [ ] Playwright: publicar → reclamar → conversar → entregar.
- [ ] k6 con 200 usuarios virtuales sobre el listado (RNF-01).
- [ ] OWASP ZAP + revisión manual de control de acceso.
- [ ] Revisión de accesibilidad (WCAG AA) y del responsivo a 360 px.

### Fase K — Despliegue y documentación
- [ ] Dockerfiles de producción + proxy inverso con TLS. En el VPS no se publican los puertos de Postgres, ni el explorador de SeaweedFS (8888, sin contraseña), ni Mailpit. Detrás del proxy, activar `app.set('trust proxy', 1)`: si no, el rate limit ve la IP del proxy y **todos** los usuarios comparten el mismo límite (ver `comun/limites/limites.ts`).
- [ ] CI en GitHub Actions: lint + pruebas en cada PR.
- [ ] Respaldo diario con `pg_dump` (30 días) + prueba de restauración.
- [ ] Documentación: arquitectura, modelo de datos, API, manual de usuario y manual de administrador.

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
│   │   │   └── admin/
│   │   ├── comun/             ← guards (sesión, roles), pipes (Zod), filtros de errores, interceptores
│   │   ├── jobs/              ← tareas cron
│   │   └── lib/               ← prisma, mailer, almacenamiento, auditoría (como providers de Nest)
│   └── test/                  ← pruebas e2e (*.e2e-spec.ts); las unitarias van junto al archivo (*.spec.ts)
└── frontend/
    └── src/
        ├── pages/
        ├── components/
        ├── services/          ← cliente HTTP
        └── hooks/
```

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
docker compose exec db createdb -U hallazgo practica                               # BD aparte para la práctica (una vez)
docker compose exec db psql -U hallazgo -d practica -f /sql/01_tablas_base.sql     # scripts de la Fase A: NUNCA sobre hallazgo_ud (borran tablas de la app)
cd backend && npm run start:dev      # backend Nest en modo desarrollo (se reinicia al guardar)
npm run test:e2e                     # pruebas de punta a punta del backend
npm run build                        # compila TypeScript a dist/
npx prisma migrate dev --name <nombre>
npx prisma migrate dev --create-only --name <nombre>   # para editar el SQL a mano
npx prisma studio                    # ver los datos en el navegador
npx prisma db seed
npm test                             # pruebas
npm run lint                         # lint completo con tipos (~23 s)
npm run format:check                 # ¿todo está formateado? (no cambia nada)
npm install                          # en la RAÍZ: instala husky y activa el hook de pre-commit
cd frontend && npm run dev           # frontend en http://localhost:5173
```

---

## 13. Preguntas abiertas (resolver con Walter antes de implementar esa parte)

1. **PERDIDO sin flujo de contacto.** La propuesta solo define reclamación sobre ENCONTRADO. Si alguien ve un PERDIDO y *tiene* el objeto, ¿qué hace? Propuesta: un botón "Lo tengo" que lo lleve a crear un ENCONTRADO ya prellenado y vinculado, para que entre al flujo normal.
2. **"Edificio análogo" (10 % del puntaje de sede).** No está definido. Opción simple: un campo `tipo_lugar` en `lugar` (cafetería, biblioteca, laboratorio…) y comparar ese campo entre sedes.
3. **¿Quién publica lo que llega a portería?** El personal de vigilancia aparece como usuario objetivo, pero no tiene rol propio. ¿Usan una cuenta normal?
4. **Revertir una reclamación aceptada.** Si el reclamante no aparece, ¿el autor puede cancelarla y volver a `ACTIVA`? Se asume que sí (sección 6.1), pero hay que confirmarlo.
5. **Visitante "lectura limitada".** ¿Qué ve exactamente? Propuesta: título, categoría, sede, fecha e imagen en miniatura, sin la descripción completa.
6. **Imágenes en publicaciones PERDIDO.** RF-08 pide "entre una y cinco" imágenes. Para un objeto perdido muchas veces no hay foto. ¿Se vuelven opcionales en ese caso?

---

## 14. Fuera de alcance / trabajo futuro (no implementar en v1)

PWA con notificaciones push · reconocimiento de imágenes · mapa interactivo del campus · SSO institucional · módulo de custodia en portería con código de retiro · sistema de reputación · tablero analítico avanzado.
