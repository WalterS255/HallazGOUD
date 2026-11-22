# Manual de administración · HallazGO UD

Para **moderadores** y **administradores**. Todo se hace desde **Administración** (`/admin`), que aparece en el menú cuando tu cuenta tiene uno de esos roles. Para el uso normal de la app, ver el [manual de usuario](manual-usuario.md). Para instalar y mantener el servidor, ver [`infra/despliegue/README.md`](../infra/despliegue/README.md).

| Rol | Qué puede hacer |
|---|---|
| **Moderador** | Revisar los reportes: ocultar publicaciones o descartar reportes |
| **Administrador** | Todo lo del moderador, más: estadísticas, catálogos (categorías, sedes y lugares) y cuentas (suspender y reactivar) |

Los roles se asignan en la base de datos (ver la guía de despliegue, sección 6). Cada acción importante queda en la **auditoría**, que nadie puede borrar ni modificar.

---

## 1. Moderación (moderador y administrador)

En **Administración → Reportes pendientes** aparece cada reporte con la publicación, quién lo hizo, cuándo y el motivo. **Plazo: 48 horas.** Los que pasan ese plazo se marcan como **Vencido**.

Para cada reporte:

- **Ocultar publicación**: la quita del catálogo (deja de verse y sus fotos tampoco se sirven). Puedes escribir un **motivo**, que le llega al autor en un aviso. Ocultar resuelve **todos** los reportes pendientes de esa publicación.
- **Descartar reporte**: si la publicación está bien, el reporte se cierra y la publicación sigue visible.

Abre la publicación (el título es un enlace) antes de decidir. Revisa sobre todo las fotos: documentos, tarjetas o llaves con datos personales a la vista deben ocultarse.

## 2. Estadísticas (administrador)

En la parte de arriba de **Administración**, con los últimos 12 meses:

- **Encontrados** y **entregados**, y la **tasa de recuperación** (entregados ÷ encontrados; la meta del semestre es ≥ 35 %).
- **Publicaciones por mes**, **categorías más frecuentes** y **lugares críticos** (donde más se pierden cosas): útiles para campañas o para reforzar la vigilancia.

## 3. Catálogos (administrador)

**Administración → Catálogos**. Es lo que la gente elige al publicar.

**Categorías**

- **Crear**: nombre, ícono y si es **sensible**. Las sensibles (documentos, tarjetas, llaves) hacen que el formulario pida tapar los datos personales en la foto.
- **Renombrar**, **Marcar sensible / Quitar sensible**.
- **Desactivar / Activar**: una categoría desactivada deja de ofrecerse al publicar, pero las publicaciones que ya la usan la conservan. Las categorías **no se borran**.

**Sedes y lugares**

- **Crear sede**, **Renombrar**, **Borrar**: una sede con lugares no se puede borrar (primero hay que borrar o mover sus lugares).
- **Agregar lugar** a una sede, con su **tipo**: biblioteca, cafetería, laboratorio, auditorio, aulas, edificio principal, administrativo u otro.
- El **tipo de lugar importa**: si alguien pierde algo en la biblioteca de una sede y aparece en la biblioteca de **otra** sede, el motor de coincidencias suma puntos de "edificio análogo". Un lugar "sin clasificar" u "otro" nunca cuenta como análogo.
- **Borrar lugar**: solo si ninguna publicación lo usa.

## 4. Cuentas (administrador)

**Administración → Cuentas**.

1. **Busca** por nombre (o parte de él) o por **correo exacto**. Por privacidad, los resultados **no muestran el correo**.
2. **Suspender**: escribe el **motivo** (le llega a la persona) y pulsa **Confirmar suspensión**. La suspensión es **inmediata**: si la persona tenía la app abierta, en su siguiente acción se le cierra la sesión.
3. **Reactivar**: devuelve el acceso.

No puedes suspender tu propia cuenta (el botón no aparece) ni una cuenta borrada.

## 5. Buenas prácticas

- Revisa los reportes **al menos una vez al día**: el plazo es de 48 horas.
- Antes de suspender una cuenta, revisa sus publicaciones y deja un motivo claro: la persona lo recibe.
- No crees categorías casi iguales ("Llaves" y "Llavero"): reparte las coincidencias y confunde a la gente. Mejor renombrar la existente.
- Clasifica cada lugar nuevo con su **tipo**.
- Si algo raro pasa (muchos reportes de una misma cuenta, publicaciones repetidas), avisa a quien administra el servidor: la auditoría registra quién hizo qué y cuándo.
