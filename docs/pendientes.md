# Pendientes

Lo que falta decidir y lo que falta construir. Cuando algo se resuelva, se borra de aquí y se refleja en `CLAUDE.md` (sección 4 si es una decisión, sección 9 si es trabajo terminado).

**Estado (2026-11-21):**
- **Backend:** todas las funciones de la propuesta están implementadas y probadas (184 pruebas unitarias, 26 e2e y 136 contra PostgreSQL).
- **Frontend:** Next.js en `frontend/`, conectado a la API. Están todas las pantallas salvo las de la sección 3.
- **Hito de la Fase F cumplido:** recorrido de punta a punta en el navegador (publicar → reclamar → chatear → entregar).

Lo de abajo son decisiones de producto, detalles y la puesta en producción.

## 1. Decisiones de producto (Walter)

Cada una con la recomendación técnica.

| # | Pregunta | Recomendación | Afecta |
|---|---|---|---|
| 1 | **¿Fotos obligatorias en un PERDIDO?** (13.6). RF-08 pide de 1 a 5 | Obligatorias en ENCONTRADO, opcionales en PERDIDO | Frontend (asistente) |
| 2 | **Botón "Lo tengo" en un PERDIDO** (13.1). Hoy la ficha dice "¿Lo encontraste? Publica el hallazgo" y abre el asistente vacío | Abrir el asistente de ENCONTRADO ya prellenado (categoría, sede, fecha); al publicarlo, el aviso de coincidencias llega al dueño | Frontend |
| 3 | **¿Cancelar una reclamación aceptada?** (13.4), por ejemplo si el reclamante no aparece | Sí: la publicación vuelve a ACTIVA y las demás pendientes siguen. La máquina de estados ya lo permite; falta la ruta (`PATCH /reclamaciones/:id` con `CANCELAR`) y el botón en el chat | Backend + frontend |
| 4 | **Reloj del celular adelantado** (13.7) | Recortar `fecha_suceso` a "ahora" si la diferencia es de pocos minutos; rechazar si es mayor | Backend (`GestionService.crear`) |
| 5 | **¿La suspensión corta la sesión al instante?** Hoy el JWT ya emitido sirve hasta 1 día | Sí: consultar `estado_cuenta` en el `SesionGuard` en cada petición (costo pequeño a este volumen) | Backend |
| 6 | **"Edificio análogo"** en otra sede (13.2): hoy vale 0 de los 10 puntos | Agregar `tipo_lugar` a `lugar` (cafetería, biblioteca, laboratorio…) y comparar ese campo | Backend + migración |
| 7 | **¿Quién publica lo que llega a portería?** (13.3) | Una cuenta normal con correo institucional; un rol propio solo si después hace falta | — |

Resueltas: qué ve un visitante (13.5, 2026-11-21: catálogo, búsqueda y ficha; nada de acciones sin sesión) y el cambio a Next.js (`CLAUDE.md` §4).

## 2. Aprobaciones (regla 4: dependencias y push)

| # | Qué | Recomendación |
|---|---|---|
| 8 | Instalar **`node-cron`** para disparar cada día la expiración a 90 días (lógica ya hecha y probada en `jobs/expiracion.service.ts`) y la limpieza de imágenes 90 días después de la entrega (§6.5, aún sin lógica) | Sí. Ya está elegido en `CLAUDE.md` §4 |
| 9 | Instalar **`gh`** (CLI de GitHub) en el PC de Walter | Opcional: permite abrir los PR desde la terminal en vez del navegador |

## 3. Trabajo técnico pendiente

### Backend
- [ ] Programador diario (depende de #8): conectar `ExpiracionService.expirarInactivas` y escribir la limpieza de imágenes de publicaciones entregadas hace más de 90 días.
- [ ] Ruta para cancelar una reclamación aceptada (depende de #3).
- [ ] Desenfoque automático de la miniatura en categorías sensibles (regla 6.6, opcional).

### Frontend
- [ ] Editar una publicación (`PUT /publicaciones/:id` ya existe).
- [ ] En `/admin`: gestión de categorías, sedes y lugares, y suspender o reactivar cuentas (los endpoints ya existen).
- [ ] Linter, Prettier y pruebas propias: hoy el hook de pre-commit solo revisa los `.ts` con la configuración del backend; los `.tsx` del frontend no se revisan.
- [ ] Recomendados en `frontend/docs/endpoints-pendientes.md` que siguen abiertos (#5: `id_publicacion` en los avisos).

### Calidad (Fase J)
- [ ] **Cobertura ≥ 60 %** (RNF-14) con pruebas unitarias. Hoy está por debajo porque `auth`, `gestion` e `imagenes` se prueban solo contra la base (cuentan en `test:db`, no en la cobertura unitaria). Opciones: agregarles pruebas unitarias, o medir la cobertura también con `test:db`.
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
