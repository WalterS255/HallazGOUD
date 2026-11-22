# Temas para decidir (frontend ↔ backend)

Salieron de integrar el frontend con la API y de probar el flujo completo (registro → activación →
publicar con foto → coincidencias → reclamar → chat → doble confirmación → ENTREGADA, más perfil,
reportes, moderación y estadísticas) contra el backend real. Cuando algo se decida, se borra de aquí y se
refleja en `CLAUDE.md` o en `docs/pendientes.md`.

## 1. Aprobación y endpoints (resuelto 2026-11-21)

- ✅ **Next.js aprobado** (`CLAUDE.md` §4), con los cambios en archivos de la raíz.
- ✅ **Endpoints:** `trust proxy` (con `TRUST_PROXY` en el backend y `CONFIAR_PROXY` aquí, para que no se pueda inventar la IP), `GET /usuarios/me/publicaciones`, `/reclamaciones`, `/conversaciones` y `GET /reclamaciones/:id` (el chat ya lo usa). Detalle en [`endpoints-pendientes.md`](endpoints-pendientes.md).
- Siguen abiertos: `id_publicacion` en los avisos `MENSAJE` y `ESTADO`, y cancelar una reclamación aceptada (`docs/pendientes.md` #3).

## 2. Producto

| #   | Tema                                             | Hoy                                                                                                                                                              | Opciones                                                                       |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **Objetos en reclamación en el catálogo**        | `GET /publicaciones` trae sólo `ACTIVA` por defecto: al aceptar una reclamación, el objeto desaparece del catálogo                                               | Mostrar también `EN_RECLAMACION` (con su insignia) o dejarlo así               |
| 2   | **Aviso de coincidencia al publicar un PERDIDO** | Sólo se avisa al publicar un ENCONTRADO. Quien publica la pérdida después ve las sugerencias en su página, pero no le llega aviso                                | Avisarle también, o dejarlo así                                                |
| 3   | **Rutas de los enlaces de los correos de aviso** | El backend enlaza a `/reclamaciones/:id` y `/publicaciones/:id/reclamaciones`; el frontend las redirige a `/mensajes/:id` y a `/publicaciones/:id#reclamaciones` | Cambiar las rutas en el backend o mantener las redirecciones                   |
| 4   | **Íconos de categoría**                          | El backend guarda un nombre (`laptop`, `id-card`…) y el frontend lo muestra como emoji; uno desconocido sale como 📦                                             | Fijar la lista de nombres válidos para cuando el admin cree categorías (RF-28) |
| 5   | ✅ Qué ve un visitante                           | **Resuelto:** catálogo, búsqueda y ficha completos; ninguna acción sin sesión                                                                                    | —                                                                              |
| 6   | ✅ Fotos en un PERDIDO                           | **Resuelto:** obligatorias también (al menos una; se sugiere una de un objeto parecido)                                                                          | —                                                                              |
| 7   | ✅ Botón "Lo tengo" en un PERDIDO                | **Resuelto:** "¡Lo tengo!" abre el asistente con categoría, título y lugar copiados (`/publicar?lo_tengo=<id>`)                                                  | —                                                                              |

## 3. Despliegue y calidad

- **Producción:** frontend y backend detrás del mismo dominio con HTTPS; sólo el frontend se expone, el
  backend queda privado. Falta el `Dockerfile` del frontend (Next.js con `output: 'standalone'`). En
  producción la cookie de sesión se marca `Secure` y exige HTTPS.
- **Control de cada commit:** husky + lint-staged revisan sólo `backend/`. Acordar linter y formateador
  del frontend (oxlint + Prettier, como el backend, o ESLint de Next.js).
- **CI (GitHub Actions):** incluir `npm run typecheck` y `npm run build` del frontend.
- **Playwright:** ya se puede escribir el E2E publicar → reclamar → conversar → entregar.
- **Windows:** si PowerShell bloquea `npm` ("la ejecución de scripts está deshabilitada"), usar `npm.cmd`.

## 4. Pendiente del lado del frontend

- Página para editar una publicación (`PUT /publicaciones/:id` ya existe).
- Gestión de categorías, sedes, lugares y cuentas en Administración (endpoints RF-28 y RF-29 ya existen).
- Auditoría de accesibilidad (WCAG 2.1 AA) y prueba en Chrome, Firefox, Edge y Safari.
