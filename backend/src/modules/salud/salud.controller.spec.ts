import { Test } from '@nestjs/testing';
import { SaludController } from './salud.controller.js';
import { SaludService } from './salud.service.js';

// Prueba unitaria: el controlador solo, sin servidor HTTP. El servicio se
// reemplaza por uno falso: aquí no se prueba la BD, solo que el controlador
// devuelve lo que el servicio le entrega.
describe('SaludController', () => {
  let controlador: SaludController;
  const estadoBd = { ok: true, bd: 'conectada', latencia_ms: 3 } as const;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [SaludController],
      providers: [{ provide: SaludService, useValue: { verificarBd: async () => estadoBd } }],
    }).compile();
    controlador = modulo.get(SaludController);
  });

  it('responde { ok: true }', () => {
    expect(controlador.verificar()).toEqual({ ok: true });
  });

  it('devuelve el estado de la BD que le da el servicio', async () => {
    await expect(controlador.verificarBd()).resolves.toEqual(estadoBd);
  });
});
