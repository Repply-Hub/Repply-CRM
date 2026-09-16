import { describe, it, expect } from 'vitest';
import { aplicarOrdemMantendoHorarios } from './ordem-das-paradas';

describe('aplicarOrdemMantendoHorarios', () => {
  const paradas = [
    { obraId: 'obra-1', horario: '09:00' },
    { obraId: 'obra-2', horario: '09:30' },
    { obraId: 'obra-3', horario: '15:00' },
  ];

  it('🔴 troca quem ocupa cada horário, e não os horários', () => {
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 2, 1])).toEqual([
      { obraId: 'obra-1', horario: '09:00' },
      { obraId: 'obra-3', horario: '09:30' },
      { obraId: 'obra-2', horario: '15:00' },
    ]);
  });

  it('a grade de horários é exatamente a mesma antes e depois', () => {
    const depois = aplicarOrdemMantendoHorarios(paradas, [0, 2, 1]);
    expect(depois.map((p) => p.horario)).toEqual(paradas.map((p) => p.horario));
  });

  it('ordem inválida devolve a lista como estava — nunca perde nem repete parada', () => {
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1])).toEqual(paradas);
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1, 1])).toEqual(paradas);
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1, 9])).toEqual(paradas);
  });
});
