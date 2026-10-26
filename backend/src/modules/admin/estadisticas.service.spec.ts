import type { EstadisticasRepository, Periodo } from './estadisticas.repository.js';
import { EstadisticasService } from './estadisticas.service.js';

function armar() {
  const periodos: Periodo[] = [];
  const anotar = async (p: Periodo) => {
    periodos.push(p);
    return [];
  };
  const repo = {
    porMes: anotar,
    categoriasFrecuentes: anotar,
    lugaresCriticos: anotar,
    recuperacion: async (p: Periodo) => {
      periodos.push(p);
      return { encontrados: 0, entregados: 0, tasa: null };
    },
  } as unknown as EstadisticasRepository;
  return { servicio: new EstadisticasService(repo), periodos };
}

describe('EstadisticasService.obtener', () => {
  it('sin fechas usa los últimos 12 meses y el mismo periodo en las 4 consultas', async () => {
    const { servicio, periodos } = armar();
    const ahora = new Date('2026-10-25T12:00:00Z');
    const e = await servicio.obtener({}, ahora);
    expect(e.periodo.hasta).toEqual(ahora);
    expect(e.periodo.desde).toEqual(new Date('2025-10-25T12:00:00Z'));
    expect(periodos).toHaveLength(4);
    expect(new Set(periodos.map((p) => `${+p.desde}-${+p.hasta}`)).size).toBe(1);
  });

  it('rechaza un periodo al revés', async () => {
    const { servicio } = armar();
    await expect(
      servicio.obtener({ desde: new Date('2026-02-01'), hasta: new Date('2026-01-01') }),
    ).rejects.toMatchObject({ codigo: 'PERIODO_INVALIDO' });
  });
});
