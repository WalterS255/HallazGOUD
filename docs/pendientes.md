# Pendientes

Lo que falta decidir y lo que falta construir. Cuando algo se resuelva, se borra de aquí y se refleja en `CLAUDE.md` (sección 4 si es una decisión, sección 9 si es trabajo terminado).

Estado del backend: **todas las funciones de la propuesta están implementadas y probadas** (177 pruebas unitarias, 23 e2e y 135 contra PostgreSQL). Lo de abajo son decisiones de producto, detalles y la puesta en producción.

## 1. Decisiones de producto (Walter)

Cada una con la recomendación técnica. Las primeras afectan al frontend.

| # | Pregunta | Recomendación | Afecta |
|---|---|---|---|
| 1 | **¿Qué ve un visitante sin sesión?** (CLAUDE.md 13.5). Hoy el catálogo y el detalle son públicos completos (sin detalle reservado ni contacto) | Visitante: título, categoría, sede, fecha y miniatura. Descripción y galería, solo con sesión | Frontend + `CatalogoService.detalle` |
| 2 | **¿Fotos obligatorias en un PERDIDO?** (13.6). RF-08 pide 1 a 5 | Obligatorias en ENCONTRADO, opcionales en PERDIDO | Frontend (asistente) |
| 3 | **Botón "Lo tengo" en un PERDIDO** (13.1) | Abre el formulario de ENCONTRADO ya prellenado; al publicarlo, el aviso de coincidencias llega solo al dueño | Frontend |
| 4 | **¿Cancelar una reclamación aceptada?** (13.4), por ejemplo si el reclamante no aparece | Sí: la publicación vuelve a ACTIVA y las demás pendientes siguen. La máquina de estados ya lo permite; falta la ruta (`PATCH /reclamaciones/:id` con `CANCELAR`) | Backend |
| 5 | **Reloj del celular adelantado** (13.7) | Recortar `fecha_suceso` a "ahora" si la diferencia es de pocos minutos; rechazar si es mayor | Backend (`GestionService.crear`) |
| 6 | **¿La suspensión corta la sesión al instante?** Hoy el JWT ya emitido sirve hasta 1 día | Sí: consultar `estado_cuenta` en el `SesionGuard` en cada petición (costo pequeño a este volumen) | Backend |
| 7 | **"Edificio análogo"** en otra sede (13.2): hoy vale 0 de los 10 puntos | Agregar `tipo_lugar` a `lugar` (cafetería, biblioteca, laboratorio…) y comparar ese campo | Backend + migración |
| 8 | **¿Quién publica lo que llega a portería?** (13.3) | Una cuenta normal con correo institucional; un rol propio solo si después hace falta | — |

## 2. Aprobaciones (regla 4: dependencias y push)

| # | Qué | Recomendación |
|---|---|---|
| 9 | Instalar **`node-cron`** para disparar cada día la expiración a 90 días (lógica ya hecha y probada en `jobs/expiracion.service.ts`) y la limpieza de imágenes 90 días después de la entrega (§6.5, aún sin lógica) | Sí. Ya está elegido en `CLAUDE.md` §4 |
| 10 | **Subir el repositorio a GitHub** (privado). Hoy todo está solo en el PC de Walter | Sí, cuanto antes: es el único respaldo del código y la persona del frontend necesitará acceso |

## 3. Trabajo técnico pendiente

### Backend
- [ ] Programador diario (depende de #9): conectar `ExpiracionService.expirarInactivas` y escribir la limpieza de imágenes de publicaciones entregadas hace más de 90 días.
- [ ] Ruta para cancelar una reclamación aceptada (depende de #4).
- [ ] Desenfoque automático de la miniatura en categorías sensibles (regla 6.6, opcional).
- [ ] Endpoint "mis publicaciones" (`GET /usuarios/me/publicaciones`) y "mis reclamaciones": el frontend las va a necesitar para las pantallas "Mis publicaciones" y "Mensajes". Hoy se puede filtrar el catálogo, pero no por autor.

### Calidad (Fase J)
- [ ] **Cobertura ≥ 60 %** (RNF-14) con pruebas unitarias. Hoy está por debajo porque `auth`, `gestion` e `imagenes` se prueban solo contra la base (cuentan en `test:db`, no en la cobertura unitaria). Opciones: agregarles pruebas unitarias, o medir la cobertura también con `test:db`.
- [ ] Playwright: publicar → reclamar → conversar → entregar (cuando exista el frontend).
- [ ] k6 con 200 usuarios virtuales sobre el listado (RNF-01). La consulta ya se midió en SQL: 5,7 ms con 10.000 publicaciones.
- [ ] OWASP ZAP y revisión manual de control de acceso.
- [ ] Accesibilidad (WCAG AA) y responsivo a 360 px (frontend).

### Despliegue (Fase K)
- [ ] Dockerfiles de producción y proxy inverso con HTTPS (`trust proxy`).
- [ ] Backend con el rol `hallazgo_app` (`infra/bd/roles.sql`, listo y probado).
- [ ] Cron de respaldos en el VPS (`infra/respaldo/*.sh`, listos y probados) y una copia fuera del servidor.
- [ ] CI en GitHub Actions.
- [ ] Manual de usuario y manual de administrador.

### Frontend (lo hace otra persona)
Todo: pantallas de inicio, catálogo, detalle, asistente de publicación (3 pasos), mis publicaciones, mensajes, notificaciones, perfil, moderación y administración. La referencia para conectarlo es [`api.md`](api.md).

## 4. Detalles del entorno a tener presentes
- El clúster **`k3s-default`** (k3d, otro proyecto) está **detenido** para liberar memoria. Para volver a usarlo: `k3d cluster start k3s-default`. Con él encendido, el PC se queda sin RAM y Docker se reinicia solo.
- La carpeta principal no se usa a la vez desde dos sesiones (ver [`arquitectura.md`](arquitectura.md#trabajo-en-paralelo)).
