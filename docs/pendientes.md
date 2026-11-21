# Pendientes

Lo que falta decidir y lo que falta construir. Cuando algo se resuelva, se borra de aquí y se refleja en `CLAUDE.md` (sección 4 si es una decisión, sección 9 si es trabajo terminado).

**Estado (2026-11-21):**
- **Backend:** todas las funciones de la propuesta están implementadas y probadas (276 pruebas unitarias (87 % de cobertura en los servicios), 26 e2e y 142 contra PostgreSQL).
- **Frontend:** Next.js en `frontend/`, conectado a la API. Están todas las pantallas salvo las de la sección 3.
- **Hito de la Fase F cumplido:** recorrido de punta a punta en el navegador (publicar → reclamar → chatear → entregar).

Lo de abajo son decisiones de producto, detalles y la puesta en producción.

## 1. Decisiones de producto (Walter)

No queda ninguna abierta.

Resueltas el 2026-11-21: suspensión al instante (el guard revisa la cuenta en cada petición), fotos obligatorias también en PERDIDO (13.6), "¡Lo tengo!" con el asistente prellenado (13.1), cancelar una reclamación aceptada (13.4), reloj del celular con 10 min de margen (13.7), edificio análogo con `lugar.tipo` (13.2), portería con una cuenta normal (13.3), qué ve un visitante (13.5) y el cambio a Next.js. Detalle en `CLAUDE.md` §13.

## 2. Aprobaciones (regla 4: dependencias y push)

| # | Qué | Recomendación |
|---|---|---|
| 8 | Instalar **`gh`** (CLI de GitHub) en el PC de Walter | Opcional: permite abrir los PR desde la terminal en vez del navegador |

## 3. Trabajo técnico pendiente

### Backend
- [ ] Limpieza de imágenes de publicaciones entregadas hace más de 90 días (§6.5): falta la lógica; el programador (`node-cron`, ya instalado) solo tiene que llamarla.
- [ ] Desenfoque automático de la miniatura en categorías sensibles (regla 6.6, opcional).

### Frontend
- [ ] Editar una publicación (`PUT /publicaciones/:id` ya existe).
- [ ] En `/admin`: gestión de categorías, sedes y lugares, y suspender o reactivar cuentas (los endpoints ya existen).
- [ ] Linter, Prettier y pruebas propias: hoy el hook de pre-commit solo revisa los `.ts` con la configuración del backend; los `.tsx` del frontend no se revisan.
- [ ] Recomendados en `frontend/docs/endpoints-pendientes.md` que siguen abiertos (#5: `id_publicacion` en los avisos).

### Calidad (Fase J)
- [ ] Playwright: automatizar el recorrido publicar → reclamar → conversar → entregar (ya se hizo a mano en el navegador).
- [ ] k6 con 200 usuarios virtuales sobre el listado (RNF-01). La consulta ya se midió en SQL: 5,7 ms con 10.000 publicaciones.
- [ ] OWASP ZAP y revisión manual de control de acceso.
- [ ] Accesibilidad (WCAG AA). El responsivo a 340 px ya se revisó en 9 pantallas sin desborde.

### Despliegue (Fase K)
- [ ] Dockerfiles de producción y proxy inverso con HTTPS (en producción, `CONFIAR_PROXY=true` en el frontend).
- [ ] Backend con el rol `hallazgo_app` (`infra/bd/roles.sql`, listo y probado).
- [ ] Cron de respaldos en el VPS (`infra/respaldo/*.sh`, listos y probados) y una copia fuera del servidor.
- [ ] CI en GitHub Actions.
- [ ] Manual de usuario y manual de administrador.

## 4. Detalles del entorno a tener presentes
- El clúster **`k3s-default`** (k3d, otro proyecto) está **detenido** para liberar memoria. Para volver a usarlo: `k3d cluster start k3s-default`. Con él encendido, el PC se queda sin RAM y Docker se reinicia solo.
- La carpeta principal no se usa a la vez desde dos sesiones (ver [`arquitectura.md`](arquitectura.md#trabajo-en-paralelo)).
- `npm run build` del frontend con `npm run dev` encendido rompe el servidor de desarrollo (los dos usan `frontend/.next`). Si pasa: apagarlo, borrar `frontend/.next` y volver a arrancar.
