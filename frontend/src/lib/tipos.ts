// Tipos de las respuestas del backend, según docs/api.md.
// Si la API cambia, este es el único archivo de tipos que hay que actualizar.

export type TipoPublicacion = 'PERDIDO' | 'ENCONTRADO';
export type EstadoPublicacion = 'ACTIVA' | 'EN_RECLAMACION' | 'ENTREGADA' | 'EXPIRADA' | 'RETIRADA';
export type EstadoReclamacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
export type Rol = 'USUARIO' | 'MODERADOR' | 'ADMIN';
/** Fecha ISO 8601 tal como llega en el JSON. */
export type FechaISO = string;

export type Persona = { id: number; nombre: string };

/** Forma de todos los errores: { error: { codigo, mensaje, detalles? } } (api.md §1). */
export type CuerpoError = {
  error: { codigo: string; mensaje: string; detalles?: { campo: string; mensaje: string }[] };
};

export type Pagina<T> = { datos: T[]; total: number; pagina: number; limite: number };

// §4 Perfil
export type Perfil = {
  id: number;
  nombre: string;
  correo: string;
  programa: string;
  foto_url: string | null;
  rol: Rol;
  notificar_por_correo: boolean;
  fecha_registro: FechaISO;
};

// §5 Catálogos
export type Categoria = { id: number; nombre: string; icono: string | null; sensible: boolean };
export type LugarCatalogo = { id: number; edificio: string; referencia: string | null };
export type Sede = { id: number; nombre: string; lugares: LugarCatalogo[] };
export type Catalogos = { categorias: Categoria[]; sedes: Sede[] };

// §6 Publicaciones
/** Fila del catálogo (GET /publicaciones). */
export type ResumenPublicacion = {
  id: number;
  tipo: TipoPublicacion;
  estado: EstadoPublicacion;
  titulo: string;
  fecha_suceso: FechaISO;
  fecha_creacion: FechaISO;
  categoria: string;
  sede: string;
  edificio: string;
  miniatura: string | null;
};

export type Imagen = { url: string; url_miniatura: string; orden: number };

/** Ficha de detalle (GET /publicaciones/:id). */
export type Publicacion = {
  id: number;
  tipo: TipoPublicacion;
  estado: EstadoPublicacion;
  titulo: string;
  descripcion: string;
  fecha_suceso: FechaISO;
  fecha_creacion: FechaISO;
  categoria: { id: number; nombre: string; sensible: boolean };
  lugar: { edificio: string; referencia: string | null; sede: { id: number; nombre: string } };
  imagenes: Imagen[];
  usuario: Persona;
};

// §9 Coincidencias
export type Coincidencia = {
  id_publicacion: number;
  puntaje: { categoria: number; sede: number; tiempo: number; texto: number; total: number };
};

// §10 Reclamaciones, chat y entrega
export type ReclamacionRecibida = {
  id: number;
  respuesta_detalle: string;
  evidencia_url: string | null;
  estado: EstadoReclamacion;
  fecha: FechaISO;
  fecha_resolucion: FechaISO | null;
  reclamante: Persona;
};
/** GET /reclamaciones/:id (partes): ficha para el chat. */
export type ReclamacionDetalle = {
  id: number;
  estado: EstadoReclamacion;
  fecha: FechaISO;
  fecha_resolucion: FechaISO | null;
  publicacion: { id: number; titulo: string; estado: EstadoPublicacion };
  autor: Persona;
  reclamante: Persona;
  soy: 'AUTOR' | 'RECLAMANTE';
  entrega: { confirmo_autor: boolean; confirmo_reclamante: boolean; fecha_entrega: FechaISO | null } | null;
};

export type ReclamacionesDePublicacion = { detalle_reservado: string | null; reclamaciones: ReclamacionRecibida[] };

export type Mensaje = { id: number; contenido: string; leido: boolean; fecha_envio: FechaISO; emisor: Persona };

// §11 Notificaciones
export type TipoNotificacion = 'RECLAMACION' | 'ESTADO' | 'MENSAJE' | 'COINCIDENCIA' | 'MODERACION';
export type Notificacion = {
  id: number;
  tipo: TipoNotificacion | string;
  mensaje: string;
  id_referencia: number | null;
  leida: boolean;
  fecha: FechaISO;
};
export type Notificaciones = { datos: Notificacion[]; no_leidas: number };

// §13 Administración
export type ReporteModeracion = {
  id: number;
  motivo: string;
  estado: 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';
  fecha: FechaISO;
  fecha_resolucion: FechaISO | null;
  publicacion: { id: number; titulo: string; estado: EstadoPublicacion; oculta: boolean };
  reportante: Persona;
  horas_pendiente: number;
  vencido: boolean;
};

export type Estadisticas = {
  periodo: { desde: FechaISO; hasta: FechaISO };
  por_mes: { mes: string; perdidos: number; encontrados: number }[];
  recuperacion: { encontrados: number; entregados: number; tasa: number | null };
  categorias_frecuentes: { id: number; nombre: string; total: number }[];
  lugares_criticos: { id: number; nombre: string; total: number }[];
};

// ── Endpoints que el frontend necesita y el backend aún no tiene (ver docs/endpoints-pendientes.md) ──

/** Propuesta: GET /usuarios/me/publicaciones */
export type MiPublicacion = ResumenPublicacion & { reclamaciones_pendientes: number };

/** Propuesta: GET /usuarios/me/reclamaciones */
export type MiReclamacion = {
  id: number;
  estado: EstadoReclamacion;
  fecha: FechaISO;
  publicacion: { id: number; titulo: string; estado: EstadoPublicacion; usuario: Persona };
};

/** Propuesta: GET /usuarios/me/conversaciones */
export type Conversacion = {
  id_reclamacion: number;
  publicacion: { id: number; titulo: string; estado: EstadoPublicacion };
  contraparte: Persona;
  ultimo_mensaje: { contenido: string; fecha_envio: FechaISO } | null;
  no_leidos: number;
};
