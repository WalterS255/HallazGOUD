# Modelo de datos

Base de datos **`hallazgo_ud`** en PostgreSQL 18, un solo esquema (`public`), 15 tablas.

- **Fuente de verdad:** `backend/prisma/schema.prisma` y la migración `backend/prisma/migrations/*_init/migration.sql` (lo que Prisma no sabe expresar está al final de esa migración, marcado `[MANUAL]`).
- **Diagrama:** [`modelo-datos.puml`](modelo-datos.puml) (pégalo en [plantuml.com/plantuml](https://www.plantuml.com/plantuml) o usa la extensión PlantUML de VS Code).
- **Historia de aprendizaje:** los mismos modelos escritos a mano en SQL están en [`sql/`](sql/) (scripts 01 a 05), con pruebas de datos malos.

## Dónde vive la base

| | PostgreSQL de la app | PostgreSQL instalado en Windows |
|---|---|---|
| Dónde | Contenedor Docker `hallazgo-db-1` (`docker compose up -d`) | Instalación propia del PC |
| Puerto local | **5433** (variable `POSTGRES_PORT`) | 5432 |
| Bases | `hallazgo_ud` (app), `hallazgo_practica` (scripts de la Fase A), `hallazgo_test_*` (pruebas: se crean y se borran solas) | Lo que hubiera antes del proyecto |

**Conectarse con pgAdmin:** Register → Server → Host `localhost`, Port `5433`, Maintenance DB `hallazgo_ud`, Username `hallazgo`, Password = `POSTGRES_PASSWORD` del archivo `.env` (raíz del proyecto). Docker Desktop debe estar abierto.

## Tablas

### Catálogos
| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `categoria` | Tipos de objeto (Electrónicos, Documentos…) | `nombre` único. `sensible` = aviso de tapar datos (regla 6.6). `activa`: no se borran, se desactivan |
| `sede` | Sedes de la UD | `nombre` único |
| `lugar` | Edificios o zonas de cada sede | FK a `sede`; `(id_sede, edificio)` único |

### Acceso
| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `usuario` | Cuentas | Correo único **sin distinguir mayúsculas** (índice sobre `lower(correo)`) y del dominio `@udistrital.edu.co` (CHECK). `estado_cuenta` ACTIVA / SUSPENDIDA / ELIMINADA. Al borrar una cuenta se **anonimiza** (Ley 1581): nombre, correo y hash quedan en NULL y el `id` se conserva |
| `token_usuario` | Enlaces de activación y recuperación | Se guarda el **SHA-256** del token, nunca el token (CHECK de 64 hex). Un solo uso (`usado_en`) y vencimiento (`expira_en`) |

### Publicaciones
| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `publicacion` | Objetos PERDIDOS y ENCONTRADOS | Estado según la máquina de estados (§6.1 de `CLAUDE.md`). `oculta` = moderación. `busqueda` es una columna **generada** (tsvector en español, título con más peso que la descripción) con índice GIN. `fecha_suceso` no puede ser posterior a `fecha_creacion` |
| `detalle_reservado` | El rasgo oculto que solo conoce el dueño | Tabla aparte 1:1 para que ninguna consulta descuidada lo filtre. Un **trigger** impide crearlo en un PERDIDO |
| `imagen` | Fotos (1 a 5) | `orden` entre 1 y 5, único por publicación. `url` y `url_miniatura` apuntan a SeaweedFS |
| `historial_estado` | Cada cambio de estado (trazabilidad) | `estado_anterior` NULL solo al crear. `id_usuario` NULL = lo hizo el sistema (cron) |

### Reclamaciones
| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `reclamacion` | Alguien dice "es mío" | **Índices únicos parciales:** solo una `ACEPTADA` por publicación, y un usuario no puede tener dos `PENDIENTE` sobre la misma |
| `mensaje` | Chat de una reclamación aceptada | 1 a 2000 caracteres |
| `entrega` | Doble confirmación | 1:1 con la reclamación. CHECK: `fecha_entrega` existe **si y solo si** confirmaron las dos partes |

### Notificaciones, moderación y auditoría
| Tabla | Para qué | Claves y reglas |
|---|---|---|
| `notificacion` | Avisos en la app | `id_referencia` sin FK: según el `tipo` apunta a una publicación o a una reclamación |
| `reporte` | Denuncias de contenido | Único parcial: un usuario no repite un reporte pendiente sobre la misma publicación |
| `auditoria` | Acciones críticas (RNF-18) | **Inmutable:** triggers impiden UPDATE, DELETE y TRUNCATE. `detalle` en jsonb, `ip` de tipo inet |

## Reglas que protege la base de datos (no solo el código)

La base es la **última barrera**: aunque el backend tuviera un error, estas reglas no se pueden romper.

| Regla | Cómo |
|---|---|
| Solo correos institucionales, únicos sin importar mayúsculas | CHECK + índice único sobre `lower(correo)` |
| Una sola reclamación aceptada por objeto | Índice único parcial (`WHERE estado = 'ACEPTADA'`) |
| No dos reclamaciones pendientes de la misma persona | Índice único parcial |
| Entregado = las dos partes confirmaron | CHECK en `entrega` |
| Detalle reservado solo en ENCONTRADO | Trigger |
| La auditoría no se modifica ni se borra | Triggers (y en producción, el rol `hallazgo_app` sin permisos de UPDATE/DELETE) |
| Fotos en las posiciones 1 a 5, sin repetir | CHECK + UNIQUE |
| Estados y tipos válidos | ENUMs de PostgreSQL |

Probado a propósito con datos malos: `docs/sql/0*_pruebas_restricciones.sql` (SQL puro) y `backend/test/db/restricciones.db-spec.ts` (desde Prisma).

## Índices principales

| Índice | Para qué consulta |
|---|---|
| `publicacion (tipo, id_categoria, fecha_suceso)` | Prefiltro del motor de coincidencias (±7 días) |
| `publicacion (estado, fecha_creacion DESC)` | Catálogo, más recientes primero |
| `publicacion USING GIN (busqueda)` | Búsqueda de texto |
| Uno por cada llave foránea | PostgreSQL no los crea solos |

Rendimiento medido con 10.000 publicaciones (`docs/sql/05_rendimiento.sql`): catálogo 5,7 ms, búsqueda 4,9 ms, prefiltro 0,04 ms. El requisito (RNF-01) es menos de 2 s.

## Concurrencia (dos personas a la vez)

Las operaciones delicadas bloquean la fila con `SELECT … FOR UPDATE` dentro de una transacción, para que dos peticiones simultáneas no se pisen:

| Operación | Qué pasaría sin el bloqueo (comprobado) |
|---|---|
| Cambiar el estado de una publicación | Dos cambios desde ACTIVA "ganaban" los dos |
| Confirmar la entrega | Si las dos partes confirmaban a la vez, la entrega quedaba abierta para siempre |
| Aceptar reclamaciones | Si se aceptaban dos a la vez, las dos quedaban aceptadas (además lo frena el índice parcial) |
| Resolver un reporte o cambiar una cuenta | Dos moderadores o admins se pisaban |

## Regla de fechas

Si un CHECK compara dos fechas de la misma fila (`fecha` con `fecha_resolucion`, `fecha_suceso` con `fecha_creacion`), las dos deben salir **del mismo reloj**. El reloj de Node (Windows) y el del contenedor difieren unos cientos de milisegundos, y mezclarlos rompe el CHECK de vez en cuando. Por eso los servicios mandan las dos fechas desde Node, o dejan las dos a la base (`now()`).

## Migraciones

```bash
cd backend
npm run db:status                    # qué migraciones están aplicadas
npx prisma migrate dev --create-only --name <nombre>   # crear una migración para editarla a mano
npm run db:migrate                   # aplicarla (en desarrollo)
npx prisma migrate deploy            # aplicarla en producción (sin preguntas)
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
                                     # debe decir "This is an empty migration"
npm run db:seed                      # datos iniciales (categorías, sedes, lugares, 3 usuarios)
```
Después de editar una migración a mano, el `migrate diff` **debe salir vacío**. Si no, la siguiente migración intentará "deshacer" lo que se agregó a mano (pasó con el índice GIN; ver §5.5 de `CLAUDE.md`).

## Usuarios de base de datos

| Usuario | Para qué | Permisos |
|---|---|---|
| `hallazgo` (dueño) | Migraciones, seed, respaldos | Todos. Se usa con `DATABASE_URL_MIGRACIONES` |
| `hallazgo_app` (producción) | El backend | Leer y escribir datos; en `auditoria` solo INSERT y SELECT; no puede DROP, desactivar triggers ni crear tablas. Se crea con `infra/bd/roles.sql` |

## Respaldos

```bash
bash infra/respaldo/respaldar.sh                              # respaldos/hallazgo_ud_<fecha>.dump (30 días)
bash infra/respaldo/restaurar.sh respaldos/<archivo>.dump     # en hallazgo_restaurada, para comprobar
```
Los respaldos tienen datos personales: la carpeta `respaldos/` está en `.gitignore`.
