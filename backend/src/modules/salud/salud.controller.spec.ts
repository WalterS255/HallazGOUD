import { Test } from '@nestjs/testing';
import { SaludController } from './salud.controller.js';

// Prueba unitaria: el controlador solo, sin servidor HTTP.
describe('SaludController', () => {
  let controlador: SaludController;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [SaludController],
    }).compile();
    controlador = modulo.get(SaludController);
  });

  it('responde { ok: true }', () => {
    expect(controlador.verificar()).toEqual({ ok: true });
  });
});
