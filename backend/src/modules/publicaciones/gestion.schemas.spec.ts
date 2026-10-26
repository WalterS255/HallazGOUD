import { esquemaCrear, esquemaEditar } from './gestion.schemas.js';

const base = {
  titulo: 'Audífonos negros',
  descripcion: 'Audífonos inalámbricos con estuche',
  id_categoria: '1', // en un formulario o en JSON puede llegar como texto
  id_lugar: 2,
  fecha_suceso: '2026-10-25T10:30:00-05:00',
};

const errores = (r: ReturnType<typeof esquemaCrear.safeParse>) =>
  r.success ? {} : Object.fromEntries(r.error.issues.map((p) => [p.path.join('.'), p.message]));

describe('esquemaCrear', () => {
  it('ENCONTRADO con detalle reservado → válido, con números y fecha convertidos', () => {
    const r = esquemaCrear.parse({ ...base, tipo: 'ENCONTRADO', detalle_reservado: 'sticker' });
    expect(r.id_categoria).toBe(1);
    expect(r.fecha_suceso).toEqual(new Date('2026-10-25T15:30:00Z')); // -05:00 → UTC
  });

  it('ENCONTRADO sin detalle reservado → error en ese campo (RF-09)', () => {
    expect(errores(esquemaCrear.safeParse({ ...base, tipo: 'ENCONTRADO' }))).toHaveProperty(
      'detalle_reservado',
    );
  });

  it('PERDIDO con detalle reservado → error claro', () => {
    const r = esquemaCrear.safeParse({ ...base, tipo: 'PERDIDO', detalle_reservado: 'x' });
    expect(errores(r).detalle_reservado).toBe(
      'Un objeto perdido no lleva detalle reservado (solo los encontrados)',
    );
  });

  it('PERDIDO sin detalle → válido', () => {
    expect(esquemaCrear.safeParse({ ...base, tipo: 'PERDIDO' }).success).toBe(true);
  });

  it('tipo inventado → mensaje claro', () => {
    expect(errores(esquemaCrear.safeParse({ ...base, tipo: 'OLVIDADO' })).tipo).toBe(
      'Indica si el objeto es PERDIDO o ENCONTRADO',
    );
  });

  it('una fecha que no es fecha → error', () => {
    const r = esquemaCrear.safeParse({ ...base, tipo: 'PERDIDO', fecha_suceso: 'ayer' });
    expect(errores(r)).toHaveProperty('fecha_suceso');
  });
});

describe('esquemaEditar', () => {
  it('un cuerpo vacío → "No hay nada que cambiar"', () => {
    const r = esquemaEditar.safeParse({});
    expect(r.success).toBe(false);
  });

  it('no permite cambiar el tipo (se descarta)', () => {
    const r = esquemaEditar.parse({ titulo: 'Título nuevo', tipo: 'ENCONTRADO' });
    expect(r).not.toHaveProperty('tipo');
  });
});
