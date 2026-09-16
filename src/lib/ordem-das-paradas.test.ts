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

  it('funciona com paradas fora da ordem de horário — deve ordenar antes de aplicar', () => {
    const paradasFora = [
      { obraId: 'obra-3', horario: '15:00' },
      { obraId: 'obra-1', horario: '09:00' },
      { obraId: 'obra-2', horario: '09:30' },
    ];
    // ordem [0, 2, 1] refere-se aos índices na ordem de horário (obra-1, obra-3, obra-2)
    // então deve resultar em: obra-1 (09:00), obra-3 (09:30), obra-2 (15:00)
    expect(aplicarOrdemMantendoHorarios(paradasFora, [0, 2, 1])).toEqual([
      { obraId: 'obra-1', horario: '09:00' },
      { obraId: 'obra-3', horario: '09:30' },
      { obraId: 'obra-2', horario: '15:00' },
    ]);
  });
});
