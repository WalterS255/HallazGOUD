import { correoRecuperacion, correoVerificacion, escaparHtml } from './plantillas.js';

const token = 'a'.repeat(64);

describe('plantillas de correo', () => {
  it('el correo de verificación lleva el enlace al frontend con el token', () => {
    const c = correoVerificacion('ana@udistrital.edu.co', 'Ana', token);
    expect(c.para).toBe('ana@udistrital.edu.co');
    expect(c.texto).toContain(`http://localhost:5173/verificar/${token}`);
    expect(c.html).toContain(`/verificar/${token}`);
    expect(c.texto).toContain('24 horas');
  });

  it('el de recuperación avisa que vence en 1 hora', () => {
    const c = correoRecuperacion('ana@udistrital.edu.co', 'Ana', token);
    expect(c.texto).toContain(`/restablecer/${token}`);
    expect(c.texto).toContain('1 hora');
  });

  it('escapa el nombre: nadie puede meter HTML en el correo', () => {
    const c = correoVerificacion(
      'x@udistrital.edu.co',
      '<a href="http://malo">Haz clic</a>',
      token,
    );
    expect(c.html).not.toContain('<a href="http://malo">');
    expect(c.html).toContain('&lt;a href=&quot;http://malo&quot;&gt;');
  });

  it('escaparHtml cubre los 5 caracteres peligrosos', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
