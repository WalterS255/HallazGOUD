# Temas para decidir (frontend ↔ backend)

Salieron de integrar el frontend con la API y de probar el flujo completo (registro → activación →
publicar con foto → coincidencias → reclamar → chat → doble confirmación → ENTREGADA, más perfil,
reportes, moderación y estadísticas) contra el backend real. Cuando algo se decida, se borra de aquí y se
refleja en `CLAUDE.md` o en `docs/pendientes.md`.

## 1. Aprobación

| # | Tema | Contexto |
|---|---|---|
| 1 | **Frontend en Next.js en lugar de React + Vite** | Marcado en `CLAUDE.md` §4 como *cambio propuesto*. Next.js sigue siendo React; trae enrutamiento por carpetas y un servidor propio que hace de proxy hacia la API (sin CORS, JWT en cookie `httpOnly`). **Implicación:** en producción el frontend es un proceso Node.js, no archivos estáticos (ver §4 de este documento) |
| 2 | **Cambios en archivos de la raíz** | `README.md` (tecnologías, cómo levantar el frontend), `CLAUDE.md` §4 y comando del frontend, `docs/arquitectura.md` (diagrama) y `.env.example` (`URL_FRONTEND=http://localhost:3001`) |

## 2. Backend: endpoints

Detalle y JSON esperado en [`endpoints-pendientes.md`](endpoints-pendientes.md).

| Prioridad | Qué | Por qué |
|---|---|---|
| **Urgente** | `app.set('trust proxy', 1)` y usar `X-Forwarded-For` | Todas las peticiones llegan desde el servidor del frontend: el límite de **5 ingresos por minuto** se reparte entre todos los usuarios. El frontend ya envía la IP real |
| Necesario | `GET /usuarios/me/publicaciones` | Pantalla "Mis publicaciones" (hoy muestra "Pendiente en el backend") |
| Necesario | `GET /usuarios/me/reclamaciones` | "Mis reclamaciones" y, en el detalle, saber si ya reclamé |
| Necesario | `GET /usuarios/me/conversaciones` | Lista de chats en "Mensajes" |
| Recomendado | `GET /reclamaciones/:id` con el estado de la entrega | Al recargar el chat no se sabe quién ya confirmó |
| Recomendado | `id_publicacion` en los avisos `MENSAJE` y `ESTADO` | Que el chat abierto desde un aviso muestre el título del objeto |
| Recomendado | Cancelar una reclamación aceptada (`pendientes.md` #4) | El frontend agregaría el botón en el chat |

## 3. Producto

| # | Tema | Hoy | Opciones |
|---|---|---|---|
| 1 | **Objetos en reclamación en el catálogo** | `GET /publicaciones` trae sólo `ACTIVA` por defecto: al aceptar una reclamación, el objeto desaparece del catálogo | Mostrar también `EN_RECLAMACION` (con su insignia) o dejarlo así |
| 2 | **Aviso de coincidencia al publicar un PERDIDO** | Sólo se avisa al publicar un ENCONTRADO. Quien publica la pérdida después ve las sugerencias en su página, pero no le llega aviso | Avisarle también, o dejarlo así |
| 3 | **Rutas de los enlaces de los correos de aviso** | El backend enlaza a `/reclamaciones/:id` y `/publicaciones/:id/reclamaciones`; el frontend las redirige a `/mensajes/:id` y a `/publicaciones/:id#reclamaciones` | Cambiar las rutas en el backend o mantener las redirecciones |
| 4 | **Íconos de categoría** | El backend guarda un nombre (`laptop`, `id-card`…) y el frontend lo muestra como emoji; uno desconocido sale como 📦 | Fijar la lista de nombres válidos para cuando el admin cree categorías (RF-28) |
| 5 | Qué ve un visitante (`pendientes.md` #1) | Catálogo y detalle completos | Recomendación del backend: sin descripción ni galería |
| 6 | Fotos en un PERDIDO (`pendientes.md` #2) | Obligatorias en ENCONTRADO, opcionales en PERDIDO | Confirmar |
| 7 | Botón "Lo tengo" en un PERDIDO (`pendientes.md` #3) | Lleva al asistente de "Encontré algo" vacío | Prellenar categoría, sede y fecha |

## 4. Despliegue y calidad

- **Producción:** frontend y backend detrás del mismo dominio con HTTPS; sólo el frontend se expone, el
  backend queda privado. Falta el `Dockerfile` del frontend (Next.js con `output: 'standalone'`). En
  producción la cookie de sesión se marca `Secure` y exige HTTPS.
- **Control de cada commit:** husky + lint-staged revisan sólo `backend/`. Acordar linter y formateador
  del frontend (oxlint + Prettier, como el backend, o ESLint de Next.js).
- **CI (GitHub Actions):** incluir `npm run typecheck` y `npm run build` del frontend.
- **Playwright:** ya se puede escribir el E2E publicar → reclamar → conversar → entregar.
- **Windows:** si PowerShell bloquea `npm` ("la ejecución de scripts está deshabilitada"), usar `npm.cmd`.

## 5. Pendiente del lado del frontend

- Página para editar una publicación (`PUT /publicaciones/:id` ya existe).
- Gestión de categorías, sedes, lugares y cuentas en Administración (endpoints RF-28 y RF-29 ya existen).
- Auditoría de accesibilidad (WCAG 2.1 AA) y prueba en Chrome, Firefox, Edge y Safari.
