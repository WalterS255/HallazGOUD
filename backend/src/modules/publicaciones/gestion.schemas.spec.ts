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

describe('lugar: sede + ubicación escrita (2026-11-24)', () => {
  const conSede = { ...base, id_lugar: undefined, tipo: 'PERDIDO', id_sede: '3' };

  it('sede + ubicación → válido, sin id_lugar', () => {
    const r = esquemaCrear.parse({ ...conSede, ubicacion: '  Cuarto piso, junto a una mesa ' });
    expect(r).toMatchObject({ id_sede: 3, ubicacion: 'Cuarto piso, junto a una mesa' });
    expect(r.id_lugar).toBeUndefined();
  });

  it('sede sin ubicación → error en ubicacion', () => {
    expect(errores(esquemaCrear.safeParse(conSede)).ubicacion).toBe('Describe dónde exactamente');
  });

  it('ni sede ni lugar → "Elige una sede"', () => {
    const r = esquemaCrear.safeParse({ ...conSede, id_sede: undefined, ubicacion: 'Piso 4' });
    expect(errores(r).id_sede).toBe('Elige una sede');
  });

  it('sede y lugar a la vez → error (crear y editar)', () => {
    const r = esquemaCrear.safeParse({ ...conSede, id_lugar: 2, ubicacion: 'Piso 4' });
    expect(errores(r).id_sede).toBe('Indica la sede o el lugar, no los dos');
    expect(esquemaEditar.safeParse({ id_sede: 1, id_lugar: 2 }).success).toBe(false);
  });

  it('editar solo la ubicación → válido', () => {
    expect(esquemaEditar.parse({ ubicacion: 'Sala 302' })).toEqual({ ubicacion: 'Sala 302' });
  });
});

describe('pista pública del detalle reservado (2026-11-24)', () => {
  const hallazgo = { ...base, tipo: 'ENCONTRADO', detalle_reservado: 'sticker de gato' };

  it('ENCONTRADO con pista → válido; sin pista también (es opcional)', () => {
    expect(esquemaCrear.parse({ ...hallazgo, pista: ' ¿Qué tiene en la tapa? ' })).toMatchObject({
      pista: '¿Qué tiene en la tapa?',
    });
    expect(esquemaCrear.safeParse(hallazgo).success).toBe(true);
  });

  it('PERDIDO con pista → error claro', () => {
    const r = esquemaCrear.safeParse({ ...base, tipo: 'PERDIDO', pista: '¿Qué color?' });
    expect(errores(r).pista).toBe('Un objeto perdido no lleva pista (solo los encontrados)');
  });

  it('la pista no puede revelar el detalle reservado', () => {
    const r = esquemaCrear.safeParse({ ...hallazgo, pista: 'Tiene un STICKER DE GATO' });
    expect(errores(r).pista).toBe('La pista no puede incluir el detalle reservado');
  });

  it('al editar, una pista vacía la quita (null)', () => {
    expect(esquemaEditar.parse({ pista: '' })).toEqual({ pista: null });
  });
});
