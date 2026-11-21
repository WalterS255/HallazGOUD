// IP real de quien hace la petición, para reenviarla al backend en X-Forwarded-For
// (el backend la usa para el límite de peticiones, con TRUST_PROXY=1).
//
// OJO: el navegador puede mandar el encabezado X-Forwarded-For que quiera. Si lo
// reenviáramos tal cual, cualquiera elegiría su IP y se saltaría el límite.
// - Sin proxy delante (desarrollo): todo X-Forwarded-For que llega es inventado →
//   no se reenvía nada y el backend cuenta por la IP de este servidor.
// - Con un proxy inverso de confianza delante (producción, CONFIAR_PROXY=true): ese
//   proxy AGREGA la IP real al final → se toma solo la última entrada.
export function ipCliente(cabeceras: Headers): string | null {
  if (process.env.CONFIAR_PROXY !== 'true') return null;
  const entradas = (cabeceras.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return entradas.at(-1) ?? null;
}
