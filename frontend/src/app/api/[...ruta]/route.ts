import type { NextRequest } from 'next/server';
import { config, COOKIE_TOKEN, DURACION_TOKEN_S, urlBackend } from '@/lib/config';

// Proxy hacia el backend: el navegador sólo habla con este servidor (/api/...) y aquí se reenvía todo.
// - No hace falta CORS en el backend (el navegador nunca lo llama directo).
// - El JWT del login se guarda en una cookie httpOnly; el código del navegador nunca lo ve (XSS no lo puede robar).

type Contexto = { params: Promise<{ ruta: string[] }> };

const CABECERAS_REENVIADAS = ['content-type', 'accept', 'accept-language', 'user-agent'];

function cookieToken(valor: string, maxAge: number) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_TOKEN}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro}`;
}

async function proxy(req: NextRequest, { params }: Contexto): Promise<Response> {
  const { ruta } = await params;
  const rutaApi = ruta.map(encodeURIComponent).join('/');

  // El backend no tiene logout (el JWT no se invalida en el servidor): cerrar sesión es borrar el token.
  if (rutaApi === 'auth/logout') {
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookieToken('', 0) } });
  }

  const headers = new Headers();
  for (const h of CABECERAS_REENVIADAS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('X-Forwarded-For', req.headers.get('x-forwarded-for') ?? '127.0.0.1');
  const token = req.cookies.get(COOKIE_TOKEN)?.value;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${urlBackend(`/${rutaApi}`)}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return Response.json(
      { error: { codigo: 'SIN_CONEXION', mensaje: `No se pudo conectar con el backend (${config.backendUrl}).` } },
      { status: 502 },
    );
  }

  const salida = new Headers();
  for (const h of ['content-type', 'cache-control', 'content-disposition', 'retry-after']) {
    const v = res.headers.get(h);
    if (v) salida.set(h, v);
  }

  // Login: el token se guarda en la cookie y no se entrega al navegador.
  if (rutaApi === 'auth/login' && res.ok) {
    const { token: nuevo, ...resto } = await res.json();
    if (typeof nuevo !== 'string') {
      return Response.json(
        { error: { codigo: 'SIN_TOKEN', mensaje: 'El backend no devolvió el token de sesión.' } },
        { status: 502 },
      );
    }
    salida.append('set-cookie', cookieToken(nuevo, DURACION_TOKEN_S));
    return Response.json(resto, { status: res.status, headers: salida });
  }

  // Token vencido o alterado: se borra para que la persona vuelva a iniciar sesión.
  if (res.status === 401 && token) salida.append('set-cookie', cookieToken('', 0));

  const sinCuerpo = res.status === 204 || res.status === 304;
  return new Response(sinCuerpo ? null : await res.arrayBuffer(), { status: res.status, headers: salida });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
