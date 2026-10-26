import { ocultarTokens } from './opciones-logger.js';

describe('ocultarTokens', () => {
  it('quita el token de un solo uso de la URL que va al log', () => {
    const token = 'ab'.repeat(32);
    expect(ocultarTokens(`/api/auth/verificar/${token}`)).toBe('/api/auth/verificar/[OCULTO]');
  });

  it('no toca las URL normales', () => {
    expect(ocultarTokens('/api/publicaciones?pagina=2&limite=20')).toBe(
      '/api/publicaciones?pagina=2&limite=20',
    );
  });
});
