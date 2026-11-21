# Pruebas del backend

Cómo están organizadas las pruebas de HallazGO UD, cómo se corren, qué prueba cada archivo y cómo escribir una nueva. Para la arquitectura general ver [`arquitectura.md`](arquitectura.md).

**Estado (2026-11-21):** 276 pruebas unitarias, 26 e2e y 142 contra PostgreSQL, todas en verde. Cobertura de los servicios: **87 % de líneas** (el mínimo exigido es 60 %, RNF-14).

---

## 1. Tres baterías, tres preguntas distintas

| Batería | Comando | Pregunta que responde | Base de datos | Tiempo aprox. |
|---|---|---|---|---|
| **Unitarias** (`*.spec.ts`, junto al archivo que prueban) | `npm test` | ¿La **regla** está bien escrita? | No: usan piezas falsas | ~20 s |
| **E2E** (`test/*.e2e-spec.ts`) | `npm run test:e2e` | ¿La app completa responde bien por HTTP (prefijo, errores, roles, límites)? | Solo `/salud/bd` la lee | ~10 s |
| **Contra PostgreSQL** (`test/db/*.db-spec.ts`) | `npm run test:db` | ¿Funciona **de verdad** con la base: CHECK, índices, triggers, transacciones, bloqueos? | Sí: crea y borra su propia base en cada corrida | ~2-3 min |

**Por qué tres y no una.** Una prueba unitaria es rápida y señala el error con precisión ("el 5.º fallo no bloqueó la cuenta"), pero usa una base falsa, así que no puede detectar, por ejemplo, que un `CHECK` de PostgreSQL rechace la fila. Una prueba contra la base sí lo detecta, pero es lenta y cuando falla cuesta más saber por qué. Se usan las dos: muchas unitarias para las reglas y las de base para lo que solo la base puede confirmar.

Todas usan **Vitest** (mismo estilo que Jest: `describe`, `it`, `expect`). Las de HTTP usan **Supertest**.

## 2. Cómo correrlas

Desde `backend/`:

```bash
npm test                 # unitarias
npm run test:cov         # unitarias + cobertura (falla si baja del 60 %)
npm run test:e2e         # e2e
npm run test:db          # contra PostgreSQL: necesita `docker compose up -d`
npx vitest run src/modules/auth/auth.service.spec.ts   # un solo archivo
npx vitest src/modules/auth                            # modo vigilancia: se repite al guardar
```

- `test:db` nunca toca `hallazgo_ud`: crea `hallazgo_test_<carpeta>_<pid>`, aplica las migraciones con `migrate deploy` y la borra al final. Por eso también prueba que **las migraciones se aplican** desde cero.
- No corras `npm install` y las pruebas a la vez en la misma carpeta (ver [`arquitectura.md`](arquitectura.md#pruebas)).
- Antes de un PR, las tres baterías + `npm run lint` + `npm run format:check` deben quedar en verde.

## 3. Cobertura (RNF-14)

**Qué es:** el porcentaje del código que las pruebas **ejecutan** al menos una vez. Una línea que ninguna prueba recorre puede tener un error que nadie va a ver hasta que llegue a producción.

**Qué se mide:** los `*.service.ts` de `src/modules/` (ahí viven las reglas de negocio, sección 6 de `CLAUDE.md`), solo con las pruebas **unitarias**. Está configurado en `vitest.config.ts`:

```ts
coverage: {
  provider: 'v8',
  include: ['src/modules/**/*.service.ts'],
  thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
},
```

- `include` hace que también cuente, en 0 %, un servicio que **ninguna** prueba carga. Sin él, ese servicio simplemente no aparecía y el promedio se inflaba: el 21 de noviembre el reporte decía 71 % cuando lo real era 41,5 %.
- `thresholds` hace que `npm run test:cov` **falle** si algún número baja del 60 %. Se comprobó subiéndolo a mano al 95 %: falla con *"Coverage for lines (87.02%) does not meet global threshold (95%)"*.

**Cómo leer el reporte:**

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
auth.service.ts    |     100 |    96.15 |     100 |     100 | 194,242
```

- **Stmts / Lines:** instrucciones y líneas ejecutadas.
- **Branch:** caminos de cada `if`/`switch`/`?:` recorridos. Es el más exigente: probar solo el caso feliz deja las ramas de error sin cubrir.
- **Funcs:** funciones llamadas al menos una vez.
- **Uncovered Line #s:** las líneas que ninguna prueba ejecutó. Empieza por ahí cuando quieras subir la cobertura.

**Cobertura alta ≠ pruebas buenas.** Una prueba que ejecuta una línea sin revisar el resultado (`expect`) suma cobertura pero no protege nada. La cobertura dice qué **no** está probado; no garantiza que lo probado esté bien.

| Servicio | Líneas | Nota |
|---|---|---|
| `auth`, `gestion`, `perfil`, `coincidencias`, `moderacion`, `notificaciones`, `mensajes`, `salud`, `estadisticas` | 97-100 % | |
| `imagenes` | 97 % | |
| `catalogos`, `usuarios-admin`, `publicaciones`, `catalogo` | 71-77 % | |
| `reclamaciones` | 49 % | `cancelar` y `confirmarEntrega` solo tienen pruebas contra la BD |
| `mi-cuenta` | 44 % | Su repositorio es casi todo SQL: se prueba en `api.db-spec.ts` |

## 4. Qué prueba cada archivo

### Unitarias (276)

| Área | Archivos (pruebas) | Qué cubren |
|---|---|---|
| Autenticación | `auth.service` (31), `auth.schemas` (10), `bloqueo` (13), `tokens` (8), `perfil.service` (7) | Registro, verificación, los 5 resultados del login, bloqueo al 5.º fallo, mismo mensaje si el correo no existe, recuperación, freno de reenvío de 2 min, tokens de un solo uso guardados como hash, foto de perfil |
| Publicaciones | `gestion.service` (23), `gestion.schemas` (8), `estados` (27), `fecha-suceso` (6), `imagenes.service` (16), `catalogo.service` (5), `publicaciones.service` (4) | Crear, editar y retirar; las 25 combinaciones de la máquina de estados; reloj del celular adelantado; subida de imágenes con limpieza de S3 si la BD falla; claves maliciosas (`../../.env`) |
| Reclamaciones y chat | `reclamaciones.service` (12), `mensajes.service` (7) | Reglas de §6.2 y §6.4: quién reclama, quién acepta, solo las dos partes en el chat, ficha de la reclamación |
| Coincidencias | `puntaje` (19), `coincidencias.service` (8) | La fórmula del §7 (día 0, 7 y 8; edificio análogo; paridad con `docs/sql/04_coincidencias.sql`) y los avisos RF-24 |
| Otros módulos | `moderacion.service` (8), `notificaciones.service` (6), `catalogos.service` (10), `estadisticas.service` (2), `mi-cuenta.service` (4), `salud` (4) | Moderación con plazo de 48 h, avisos que nunca lanzan, catálogos en uso, la contraparte del chat |
| Piezas comunes | `filtro-errores` (5), `validacion-zod.pipe` (5), `configuracion` (6), `opciones-logger` (2), `plantillas` (4), `procesar` (8), `expiracion.service` (2), `programador.service` (6) | Forma de los errores, mensajes de Zod en español, el servidor no arranca con un `.env` malo, secretos ocultos en el log, correos sin HTML inyectado, imágenes a WEBP sin GPS, el cron a las 3:00 a. m. de Colombia que nunca tumba el servidor |

### E2E (26)

| Archivo | Qué cubre |
|---|---|
| `salud.e2e-spec.ts` (4) | `GET /api/salud` y `/api/salud/bd` (la única que se conecta a la base, solo para leer), el prefijo `/api` y que no se anuncia Express |
| `errores.e2e-spec.ts` (9) | Forma `{ error: { codigo, mensaje } }`: 404, 500 sin detalles internos (también en funciones async), errores de negocio, JSON mal escrito → 400, cuerpo de más de 100 KB → 413, validación con un detalle por campo, y el `X-Request-Id` |
| `roles.e2e-spec.ts` (7) | `RolesGuard`: sin sesión → 401, USUARIO o MODERADOR en una ruta de ADMIN → 403, ADMIN → 200 (los tokens vencidos o alterados se prueban en `auth.db-spec.ts`) |
| `limites.e2e-spec.ts` (6) | Rate limit: 5/min en login, rutas exentas y **que una IP inventada en `X-Forwarded-For` no salta el límite** |

### Contra PostgreSQL (142)

| Archivo | Qué cubre |
|---|---|
| `restricciones` (12) | Cada `CHECK`, el correo único sin importar mayúsculas, los índices únicos parciales y el trigger de la auditoría inmutable |
| `api` (18) | **El flujo completo** (reclamar → aceptar → chatear → entregar → cancelar) y la **prueba anti-fuga** (§6.3): guarda todas las respuestas y falla si alguna trae correo, hash, token o el detalle reservado |
| `auth` (13), `perfil` (8) | Registro, activación, login, recuperación y foto de perfil por HTTP |
| `gestion` (14), `imagenes` (8), `catalogo` (13) | Crear, editar y retirar; subida con el máximo de 5 bajo concurrencia; filtros, búsqueda y orden del catálogo |
| `reclamaciones` (10), `mensajes` (6), `estados` (5) | Dos aceptaciones simultáneas (gana una), dos confirmaciones simultáneas, atomicidad de los cambios de estado |
| `coincidencias` (5), `aviso-coincidencia` (3) | El prefiltro SQL (±7 días), el aviso RF-24 y el edificio análogo |
| `admin` (14), `moderacion` (6), `estadisticas` (4) | Catálogos, suspensión **al instante**, el rol que manda es el de la BD, moderación, estadísticas en hora de Colombia |
| `expiracion` (3) | Expiración a 90 días (89, 91 y 200 días) |

## 5. Cómo escribir una prueba unitaria

El patrón que usan todos los `*.service.spec.ts`: una función `armar()` que crea el servicio con **piezas falsas** que anotan lo que se les pide. Funciona porque Nest recibe cada pieza por el constructor (inyección de dependencias): en la prueba se pasa una falsa en lugar de la real.

```ts
function armar(o: { cuenta?: Cuenta | null } = {}) {
  const llamadas: string[] = [];
  const repo = {
    buscarParaLogin: async () => (o.cuenta === undefined ? cuentaBase() : o.cuenta),
    guardarIntentos: async (_id: number, e: { intentosFallidos: number }) => {
      llamadas.push(`guardarIntentos:${e.intentosFallidos}`);
    },
  } as unknown as AuthRepository;
  // … auditoría, correo y JWT falsos igual …
  return { servicio: new AuthService(repo, auditoria, correo, jwt), llamadas };
}

it('clave mala → 401 genérico y suma un intento', async () => {
  const { servicio, llamadas } = armar();
  await expect(servicio.login({ correo, contrasena: 'otra' }, ctx)).rejects.toMatchObject({
    codigo: 'CREDENCIALES_INVALIDAS',
  });
  expect(llamadas).toEqual(['guardarIntentos:1']);
});
```

Consejos:

- **Prueba lo que el servicio decide, no lo que hace Prisma.** "Si la clave es mala, suma un intento y audita" es del servicio; "el `UPDATE` cambia la fila" es de la base y va en `test:db`.
- **Anota el orden de las llamadas** (`llamadas.push(...)`) cuando el orden importa: por ejemplo, el correo se envía **después** de guardar, y la foto vieja se borra **después** de guardar la nueva.
- **Prueba los caminos de error**, no solo el feliz. Ahí suele estar la seguridad (y ahí se gana la cobertura de ramas).
- **Que la prueba no dependa del `.env`.** Si una prueba compara contra `localhost:5173` escrito a mano, falla el día que alguien cambie el puerto. Usa el valor de `config` o pásalo explícito: `configurarApp(app, 0)` en `limites.e2e-spec.ts` fija "sin proxy" diga lo que diga el `.env`.
- **Funciones puras cuando se pueda.** `puntaje.ts`, `bloqueo.ts`, `tokens.ts` y `fecha-suceso.ts` no tocan la base ni el reloj: se prueban con datos fijos, sin falsos.
- Si generas un archivo real (una imagen), hazlo en memoria: `sharp({ create: { width: 40, height: 30, channels: 3, background: '#3366cc' } }).png().toBuffer()`.

## 6. Cómo escribir una prueba contra la base

- Usa las ayudas de `test/db/ayudas.ts`: `clienteTest()`, `crearUsuario()`, `crearLugar()`, `crearPublicacion()`, `unico('prefijo')` (nombres que no chocan entre pruebas).
- Los tokens se firman con el `JwtService` de la app (`app.get(JwtService).signAsync({ sub, rol })`), así no hace falta pasar por el login en cada prueba.
- Si la prueba toca una ruta nueva, agrégala al flujo de `api.db-spec.ts` para que la **revisión anti-fuga** también la vigile.
- **Regla de fechas** (`CLAUDE.md`, Fase C): si un `CHECK` compara dos fechas de la misma fila, las dos deben salir del mismo reloj (las dos de Node o las dos de la base).
- La concurrencia se prueba lanzando dos peticiones a la vez con `Promise.all` y comprobando que gana una sola.

## 7. Errores que ya nos pasaron (para no repetirlos)

| Qué pasó | Lección |
|---|---|
| El reporte de cobertura decía 71 % y lo real era 41,5 % | Sin `coverage.include`, lo que no se prueba ni aparece |
| `CLAUDE.md` decía que el límite del 60 % estaba configurado y no lo estaba | Una regla que ninguna herramienta hace cumplir es solo una frase |
| Una prueba fallaba al cambiar `URL_FRONTEND` en el `.env` | Las pruebas no deben depender de la configuración local |
| Una prueba de coincidencias buscaba `id` y la API devuelve `id_publicacion` | Antes de suponer que el código falla, revisa la forma real de la respuesta (`docs/api.md`) |
| Activar `trust proxy` parecía arreglado y se podía falsificar la IP | Prueba el ataque, no solo el caso feliz: 7 logins con IPs inventadas lo demostraron |

## 8. Frontend: el recorrido completo con Playwright

**Playwright** abre un navegador real (Chromium) y usa la app como lo haría una persona: escribe en los campos, pulsa botones y revisa lo que aparece en pantalla. Es la única prueba que junta **todo** a la vez: frontend, proxy, backend, PostgreSQL, SeaweedFS (las fotos) y las reglas de negocio.

| Archivo | Qué hace |
|---|---|
| `frontend/playwright.config.ts` | Pantalla de **celular de 360 px** (RNF-04), hora de Colombia, un solo trabajador; arranca el backend y el frontend si no están encendidos |
| `frontend/e2e/ayudas.ts` | Usuarios del seed, inicio de sesión por el formulario y una foto PNG de prueba |
| `frontend/e2e/recorrido.spec.ts` | **Dos personas a la vez**, cada una en su propio navegador: la autora publica con foto (asistente de 3 pasos), el reclamante lo busca y lo reclama, la autora acepta, conversan y los dos confirman la entrega. Comprueba también que el detalle reservado **no** le aparece al reclamante |

Desde `frontend/` (necesita `docker compose up -d` y el seed del backend):

```bash
npm run test:e2e          # en segundo plano (~30 s)
npm run test:e2e:ver      # mostrando el navegador, para ver qué hace
npx playwright show-report   # informe HTML de la última corrida
```

- Busca los elementos **como los ve una persona**: por su etiqueta (`getByLabel('Contraseña')`), su rol y su texto (`getByRole('button', { name: 'Publicar' })`). Si una etiqueta se pierde, la prueba falla, y eso también es un problema de accesibilidad.
- Cada corrida usa un título único, así no se confunde con datos de corridas anteriores. Deja esos datos en `hallazgo_ud` (es tu base de desarrollo).
- Si falla, guarda una **grabación paso a paso** (`trace`) con capturas: `npx playwright show-trace test-results/…/trace.zip`.
- Cada corrida inicia sesión 2 veces. El login permite 5 por minuto, así que **no la corras más de 2 veces en el mismo minuto**.
- Estable: pasó 3 corridas seguidas (2026-11-21).

**Lo que todavía no tiene el frontend:** linter propio y pruebas de sus componentes por separado (ver [`pendientes.md`](pendientes.md)).
