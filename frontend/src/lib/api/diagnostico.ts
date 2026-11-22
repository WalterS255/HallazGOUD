import 'server-only';
import { config, urlBackend } from '../config';
import { cabecerasDeSesion } from './servidor';

export type Chequeo = {
  nombre: string;
  estado: 'ok' | 'falla' | 'info';
  detalle: string;
  ms?: number;
};

async function medir(ruta: string) {
  const inicio = Date.now();
  try {
    const res = await fetch(urlBackend(ruta), {
      headers: await cabecerasDeSesion(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, ms: Date.now() - inicio, error: null as string | null };
  } catch (e) {
    const causa = e instanceof Error ? ((e.cause as { code?: string })?.code ?? e.name) : String(e);
    return { status: null, json: null, ms: Date.now() - inicio, error: causa };
  }
}

/** Diagnóstico desde el servidor del frontend hacia el backend (usa /salud y /salud/bd de api.md §2). */
export async function diagnosticarBackend(): Promise<{ ok: boolean; chequeos: Chequeo[] }> {
  const chequeos: Chequeo[] = [
    {
      nombre: 'Backend configurado',
      estado: 'info',
      detalle: `${config.backendUrl}${config.apiPrefix}`,
    },
  ];

  const salud = await medir('/salud');
  if (salud.status === null) {
    chequeos.push({
      nombre: 'Servidor del backend',
      estado: 'falla',
      ms: salud.ms,
      detalle: `Sin respuesta (${salud.error}). Arráncalo con: cd backend && npm run start:dev`,
    });
    return { ok: false, chequeos };
  }
  chequeos.push({
    nombre: 'Servidor del backend',
    estado: salud.status === 200 ? 'ok' : 'falla',
    ms: salud.ms,
    detalle: `GET /salud respondió ${salud.status}`,
  });

  const bd = await medir('/salud/bd');
  chequeos.push({
    nombre: 'Base de datos',
    estado: bd.status === 200 ? 'ok' : 'falla',
    ms: bd.ms,
    detalle:
      bd.status === 200
        ? `Conectada (latencia ${bd.json?.latencia_ms ?? '?'} ms)`
        : 'No responde. Levanta los servicios con: docker compose up -d',
  });

  const catalogos = await medir('/catalogos');
  const nCat = catalogos.json?.categorias?.length ?? 0;
  chequeos.push({
    nombre: 'Datos iniciales',
    estado: catalogos.status === 200 && nCat > 0 ? 'ok' : 'falla',
    ms: catalogos.ms,
    detalle:
      catalogos.status === 200 && nCat > 0
        ? `${nCat} categorías y ${catalogos.json.sedes.length} sedes`
        : 'Sin categorías: en backend/ ejecuta npx prisma migrate deploy y npm run db:seed',
  });

  const yo = await medir('/usuarios/me');
  chequeos.push({
    nombre: 'Sesión',
    estado: yo.status === 200 || yo.status === 401 ? 'info' : 'falla',
    ms: yo.ms,
    detalle:
      yo.status === 200
        ? `Con sesión como ${yo.json?.nombre} (${yo.json?.rol})`
        : yo.status === 401
          ? 'Sin sesión (normal si no has ingresado)'
          : `GET /usuarios/me respondió ${yo.status}`,
  });

  return { ok: chequeos.every((c) => c.estado !== 'falla'), chequeos };
}
