// Llamadas desde el navegador. Van a /api/... del propio frontend, que las reenvía al backend.

import type { CuerpoError } from '../tipos';

export class ErrorApi extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo: string,
    /** Mensaje por campo de los 400 SOLICITUD_INVALIDA. */
    public campos: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Opciones = { metodo?: string; cuerpo?: unknown; formData?: FormData };

export async function llamarApi<T = unknown>(url: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, formData } = opciones;
  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: formData ?? (cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined),
    });
  } catch {
    throw new ErrorApi(
      'No hay conexión. Revisa tu internet e intenta de nuevo.',
      0,
      'SIN_CONEXION',
    );
  }
  const datos = (await res.json().catch(() => ({}))) as Partial<CuerpoError> & T;
  if (!res.ok) {
    const e = datos.error;
    const campos = Object.fromEntries((e?.detalles ?? []).map((d) => [d.campo, d.mensaje]));
    let mensaje = e?.mensaje ?? 'Ocurrió un error inesperado. Intenta de nuevo.';
    const espera = res.headers.get('Retry-After');
    if (res.status === 429 && espera)
      mensaje = `Demasiados intentos. Espera ${espera} segundos e intenta de nuevo.`;
    throw new ErrorApi(mensaje, res.status, e?.codigo ?? 'DESCONOCIDO', campos);
  }
  return datos;
}

/** Mensaje de error de un campo del formulario, si el backend lo marcó. */
export function errorDeCampo(error: unknown, campo: string): string | undefined {
  return error instanceof ErrorApi ? error.campos[campo] : undefined;
}
