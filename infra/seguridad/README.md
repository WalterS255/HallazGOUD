# Seguridad: OWASP ZAP y revisión de control de acceso (Fase J)

Revisión del 2026-11-21 con **OWASP ZAP 2.17.0** (`zaproxy/zap-stable:2.17.0`, en Docker) y revisión manual de quién puede usar cada ruta de la API.

## 1. Los dos escaneos

| Escaneo | Contra qué | Qué hace | ¿Ataca? |
|---|---|---|---|
| **Pasivo** (`zap-baseline.py -j`) | El frontend (`localhost:3001`) | Recorre la app con un navegador (araña AJAX, porque Next arma los enlaces con JavaScript) y analiza encabezados, cookies, formularios e información que se filtra | No |
| **Activo** (`zap-api-scan.py`) | La API pública, según `api-publica.yaml` | Prueba cada parámetro con ataques: inyección SQL, XSS, recorrido de rutas, metadatos de nube, tipos inválidos… | **Sí**: por eso va contra el backend de la prueba de carga (puerto 3100, base `hallazgo_carga`, desechable), **nunca** contra `hallazgo_ud` |

### Cómo repetirlos (desde la raíz, con Git Bash)

```bash
# Pasivo: necesita el backend (3000) y el frontend (3001) encendidos.
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/infra/seguridad/informes:/zap/wrk:rw" zaproxy/zap-stable:2.17.0 zap-baseline.py -t http://host.docker.internal:3001 -j -m 3 -I -r pasivo-frontend.html -J pasivo-frontend.json

# Activo: primero la base y el backend de carga (ver infra/carga/README.md).
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/infra/seguridad:/zap/wrk:rw" zaproxy/zap-stable:2.17.0 zap-api-scan.py -t /zap/wrk/api-publica.yaml -f openapi -I -r informes/activo-api.html -J informes/activo-api.json
```

Los informes (`informes/*.html`, `*.json`) no se suben al repositorio: se regeneran.

## 2. Resultado

| | Antes | Después de los arreglos |
|---|---|---|
| Activo (API) | 0 fallos, 3 avisos, 113 superados | **0 fallos, 1 aviso aceptado, 120 superados** |
| Pasivo (frontend) | 0 fallos, 10 avisos | **0 fallos**; los avisos que quedan están aceptados abajo |

### Lo que se encontró y se corrigió

| Hallazgo | Riesgo | Arreglo | Prueba que lo vigila |
|---|---|---|---|
| **Contraseña en la URL** (`/login?contrasena=…&correo=…`) | Si alguien pulsa "Ingresar" antes de que cargue el JavaScript (celular lento), el navegador envía el formulario solo, por GET: la contraseña queda en el historial y en los logs | `method="post"` en los 8 formularios que maneja React (login, registro, recuperar, restablecer, reclamar, reportar, chat, perfil) | `frontend/e2e/seguridad.spec.ts` (navegador **sin JavaScript**). Contraprueba: sin el arreglo falla mostrando `…&contrasena=Secreta-123456` |
| **Error 500 con el carácter nulo** (`q=%00`, `\u0000` en el correo o el nombre) | PostgreSQL no admite `\u0000` (error 22021): un dato inválido se volvía "error interno" | El Pipe `ValidacionZod` rechaza `\u0000` en **cualquier** entrada con 400 y el campo marcado | `validacion-zod.pipe.spec.ts` |
| Faltaba **Content-Security-Policy** en el frontend | Sin CSP, un script inyectado podría cargar código de otro sitio, enviar datos fuera o enmarcar la app | CSP en `next.config.ts` (`frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `connect-src 'self'`…) | `seguridad.spec.ts` + toda la batería de Playwright pasa con la CSP activa |
| Faltaban `Permissions-Policy`, `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy` | Menores: acceso a cámara/GPS, ventanas emergentes y lecturas desde otros sitios | Agregados en `next.config.ts` (frontend) y `configurar-app.ts` (API) | `seguridad.spec.ts`, `salud.e2e-spec.ts` |
| Faltaba `X-Content-Type-Options: nosniff` en la API | El navegador podría "adivinar" que un JSON es HTML | `configurar-app.ts` | `salud.e2e-spec.ts` |

### Avisos aceptados (y por qué)

| Aviso | Por qué se acepta |
|---|---|
| **CSP con `'unsafe-inline'`** en scripts y estilos | Next inyecta scripts en línea para hidratar la página. Quitarlo exige nonces por petición (mejora futura). La defensa principal contra XSS sigue siendo React (escapa todo) y no usar `dangerouslySetInnerHTML` (RNF-08) |
| CSP con `'unsafe-eval'` y `ws:`/`wss:` | **Solo en desarrollo** (React necesita `eval` y Next recarga por websocket). En producción no se envían (`next.config.ts`) |
| "Ausencia de tokens anti-CSRF" en login, registro y recuperar | La sesión va en una cookie `HttpOnly; SameSite=Lax`: el navegador **no la envía** en un POST que viene de otro sitio, así que esa petición llega sin sesión (401). Los formularios públicos (login, registro) no actúan sobre ninguna sesión |
| `Cross-Origin-Embedder-Policy` ausente | Solo hace falta para funciones de "aislamiento entre orígenes" que la app no usa |
| "Funciones JS peligrosas" y "comentarios sospechosos" en `/_next/static/…` | Son los paquetes de **desarrollo** de Next (sin minificar). Repetir el pasivo contra `next build` en la Fase K |
| "Atributo HTML controlable por el usuario" en `/publicaciones?…` | Los filtros vuelven a aparecer en los campos del formulario; React los escapa. Falso positivo |
| "Redirección grande" en `/publicar` | Es la redirección al login de un visitante: no lleva datos de nadie |
| HTML en lugar de JSON fuera de `/api` (`/`, `/latest/meta-data/`…) | Dentro de `/api` todo responde JSON (también los 404). Fuera de `/api` responde la página por defecto de Express; en producción el proxy solo reenvía `/api` al backend |

## 3. Revisión manual de control de acceso

Para cada ruta: quién **debe** poder usarla y qué prueba demuestra que **quien no debe, no puede**. Los permisos se deciden en el servidor; el frontend solo oculta botones.

**Mecanismos:**

- `SesionGuard` (global): sin token = visitante; token alterado o vencido → 401 `SESION_INVALIDA`; cuenta suspendida → 401 `CUENTA_SUSPENDIDA` **al instante**; el rol vigente sale de la base, no del token.
- `RolesGuard` (global) + `@Autenticado()` / `@Roles(…)`. En el panel, `@Roles` está en **todo el controlador**: una ruta nueva no puede quedar abierta por olvido.
- Autoría y "partes" (autor ↔ reclamante) las revisa cada servicio, porque no son roles sino relaciones. Para no revelar qué existe, "no existe" y "no es tuyo" responden igual (403 o 404, según la ruta).

| Ruta | Quién puede | Lo que se prueba | Dónde |
|---|---|---|---|
| `POST /auth/*` | Cualquiera (5 por minuto por IP) | Límite estricto; IP inventada no lo salta; mismo mensaje si el correo no existe | `limites.e2e-spec`, `auth.db-spec`, `auth.service.spec` |
| `GET /usuarios/me` y `PUT /usuarios/me` | Sesión | Sin sesión 401; token alterado 401; suspendida 401 | `auth.db-spec`, `perfil.db-spec`, `admin.db-spec` |
| `GET /usuarios/me/publicaciones`, `/reclamaciones`, `/conversaciones` | Sesión, solo lo propio (el id sale del token) | Sin sesión 401; cada persona ve solo lo suyo; tercero ve `[]` | `api.db-spec` |
| `GET /publicaciones`, `GET /publicaciones/:id` | Público | Oculta por moderación → 404; nunca correo ni detalle reservado (anti-fuga) | `catalogo.db-spec`, `moderacion.db-spec`, `api.db-spec` |
| `POST /publicaciones` | Sesión | Sin sesión 401 | `gestion.db-spec` |
| `PUT /publicaciones/:id` | Autor | Otra persona 403; estado final 409 | `gestion.db-spec`, `gestion.service.spec` |
| `DELETE /publicaciones/:id` | Autor, moderador o admin | Otro usuario 403; un moderador sí | `gestion.db-spec` |
| `POST /publicaciones/:id/imagenes`, `DELETE …/imagenes/:orden` | Autor | Sin sesión 401; otra persona 403 | `imagenes.db-spec`, `imagenes.service.spec` |
| `GET /imagenes/…` | Público | Publicación oculta → 404; `..%2F..%2F.env` → 404 | `imagenes.db-spec` |
| `GET /publicaciones/:id/coincidencias` | Autor | Sin sesión 401; otro usuario 403 | `api.db-spec` |
| `POST /publicaciones/:id/reclamaciones` | Sesión (no el autor) | Sin sesión 401; el autor no reclama lo suyo (409 `RECLAMACION_PROPIA`) | `api.db-spec`, `reclamaciones.db-spec`, `reclamaciones.service.spec` |
| `GET /publicaciones/:id/reclamaciones` (con el detalle reservado) | Autor | Tercero 403; **solo** aquí aparece el detalle reservado (anti-fuga) | `api.db-spec` |
| `PATCH /reclamaciones/:id` (aceptar / rechazar) | Autor | El reclamante no se acepta a sí mismo (403) | `api.db-spec` |
| `PATCH /reclamaciones/:id` (cancelar) | Las dos partes | Tercero 403 | `api.db-spec` |
| `GET /reclamaciones/:id`, `GET/POST …/mensajes`, `POST …/entrega` | Las dos partes | Tercero 403; inexistente = mismo 403; tercero no confirma entrega | `api.db-spec`, `mensajes.db-spec`, `reclamaciones.db-spec` |
| `GET /notificaciones`, `PATCH /notificaciones/:id` | Sesión, solo las propias | Sin sesión 401; marcar una ajena → 404 | `api.db-spec` |
| `POST /reportes` | Sesión | Sin sesión 401; no se reporta lo propio | `moderacion.db-spec` |
| `GET/PATCH /admin/reportes` | Moderador o admin | Usuario 403 | `moderacion.db-spec`, `roles.e2e-spec` |
| `/admin/categorias`, `/admin/sedes`, `/admin/lugares`, `/admin/usuarios`, `/admin/estadisticas` | Admin | Usuario 403; visitante 401; un "ADMIN" degradado en la base ya no entra aunque su token lo diga | `admin.db-spec`, `api.db-spec`, `roles.e2e-spec` |

**Conclusión:** cada ruta que escribe o lee datos privados tiene al menos una prueba que demuestra que un visitante (401) y una persona sin relación (403 o 404) no pueden usarla.
