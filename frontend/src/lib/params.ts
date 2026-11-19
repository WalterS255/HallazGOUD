// Ayudas para leer los searchParams de las páginas (Next.js 15 los entrega como Promise).

export type ParamsBusqueda = Promise<Record<string, string | string[] | undefined>>;

export function unico(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export function aObjetoPlano(sp: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, unico(v)]));
}

/** Evita redirecciones abiertas: sólo rutas internas. */
export function rutaSegura(v: string | undefined, porDefecto = '/') {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : porDefecto;
}
