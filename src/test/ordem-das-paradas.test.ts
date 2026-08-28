import { describe, it, expect } from 'vitest';
import {
  ordenarPorHorario,
  moverParadaMantendoHorarios,
  estaEmOrdemCrescente,
} from '@/lib/ordem-das-paradas';

/**
 * A rota de visita nunca pode ficar fora da ordem do relógio.
 *
 * 🔴 O caso que o Lucas relatou em 28/08/2026, com as palavras dele: "não deve conseguir
 * reordenar uma rota para que ela fique sem lógica onde começa com uma obra às 11hrs, depois
 * logo abaixo uma de 9hrs, depois volta para as 14hrs".
 *
 * O teste da última seção é o contrato: NENHUMA sequência de arrastar e digitar pode produzir
 * uma lista fora de ordem.
 */

const p = (obraId: string, horario: string) => ({ obraId, horario });

describe('ordenarPorHorario', () => {
  it('põe o mais cedo em cima', () => {
    const fora = [p('c', '14:00'), p('a', '09:00'), p('b', '10:30')];
    expect(ordenarPorHorario(fora).map((x) => x.obraId)).toEqual(['a', 'b', 'c']);
  });

  it('🔴 compara como relógio, não como texto: 9:00 vem antes de 10:00', () => {
    // Sem dois dígitos, a comparação alfabética colocaria '9:00' DEPOIS de '10:00'.
    const fora = [p('dez', '10:00'), p('nove', '9:00')];
    expect(ordenarPorHorario(fora).map((x) => x.obraId)).toEqual(['nove', 'dez']);
  });

  it('empate mantém quem já estava na frente', () => {
    const empatadas = [p('a', '09:00'), p('b', '09:00'), p('c', '09:00')];
    expect(ordenarPorHorario(empatadas).map((x) => x.obraId)).toEqual(['a', 'b', 'c']);
  });

  it('parada sem horário vai para o fim, e não some', () => {
    const comVazio = [p('sem', ''), p('a', '09:00')];
    const ordenadas = ordenarPorHorario(comVazio);
    expect(ordenadas.map((x) => x.obraId)).toEqual(['a', 'sem']);
    expect(ordenadas).toHaveLength(2);
  });

  it('não altera a lista original', () => {
    const original = [p('c', '14:00'), p('a', '09:00')];
    ordenarPorHorario(original);
    expect(original.map((x) => x.obraId)).toEqual(['c', 'a']);
  });
});

describe('moverParadaMantendoHorarios', () => {
  it('🔴 arrastar a última para o topo NÃO produz 14h, 09h, 10h', () => {
    const paradas = [p('a', '09:00'), p('b', '10:00'), p('c', '14:00')];
    const depois = moverParadaMantendoHorarios(paradas, 2, 0);

    // A obra `c` passa a ser a primeira visita do dia — e recebe o horário da primeira faixa.
    expect(depois).toEqual([p('c', '09:00'), p('a', '10:00'), p('b', '14:00')]);
    expect(estaEmOrdemCrescente(depois)).toBe(true);
  });

  it('preserva a GRADE de horários irregulares, trocando só quem ocupa cada faixa', () => {
    const paradas = [p('a', '09:00'), p('b', '09:30'), p('c', '15:00')];
    const depois = moverParadaMantendoHorarios(paradas, 0, 2);

    expect(depois.map((x) => x.horario)).toEqual(['09:00', '09:30', '15:00']);
    expect(depois.map((x) => x.obraId)).toEqual(['b', 'c', 'a']);
  });

  it('arrastar do meio para o topo empurra as outras para baixo', () => {
    const paradas = [p('a', '09:00'), p('b', '10:00'), p('c', '11:00'), p('d', '12:00')];
    const depois = moverParadaMantendoHorarios(paradas, 2, 0);

    expect(depois).toEqual([
      p('c', '09:00'),
      p('a', '10:00'),
      p('b', '11:00'),
      p('d', '12:00'),
    ]);
  });

  it('soltar no mesmo lugar não muda nada', () => {
    const paradas = [p('a', '09:00'), p('b', '10:00')];
    expect(moverParadaMantendoHorarios(paradas, 1, 1)).toEqual(paradas);
  });

  it('🔴 índice fora da lista devolve a lista intacta, em vez de embaralhar', () => {
    const paradas = [p('a', '09:00'), p('b', '10:00')];
    expect(moverParadaMantendoHorarios(paradas, 5, 0)).toEqual(paradas);
    expect(moverParadaMantendoHorarios(paradas, 0, 9)).toEqual(paradas);
    expect(moverParadaMantendoHorarios(paradas, -1, 0)).toEqual(paradas);
  });

  it('normaliza uma lista que já chegou torta', () => {
    // Rota antiga, salva antes desta correção: 11h, 09h, 14h.
    const torta = [p('a', '11:00'), p('b', '09:00'), p('c', '14:00')];
    const depois = moverParadaMantendoHorarios(torta, 2, 0);

    expect(estaEmOrdemCrescente(depois)).toBe(true);
  });
});

describe('🔴 contrato: nenhuma sequência de ações deixa a rota fora de ordem', () => {
  it('cem arrastes seguidos, e a lista continua cronológica', () => {
    let paradas = [
      p('a', '08:00'),
      p('b', '09:30'),
      p('c', '11:00'),
      p('d', '13:15'),
      p('e', '16:00'),
    ];

    // Sequência determinística — nada de aleatório, para o teste falhar sempre igual.
    for (let i = 0; i < 100; i++) {
      const de = i % paradas.length;
      const para = (i * 3 + 1) % paradas.length;
      paradas = moverParadaMantendoHorarios(paradas, de, para);

      expect(estaEmOrdemCrescente(paradas)).toBe(true);
      expect(paradas).toHaveLength(5);
      expect(new Set(paradas.map((x) => x.obraId)).size).toBe(5);
    }

    // A grade de horários é a mesma do começo ao fim.
    expect(paradas.map((x) => x.horario)).toEqual([
      '08:00',
      '09:30',
      '11:00',
      '13:15',
      '16:00',
    ]);
  });

  it('digitar um horário mais cedo joga a parada para cima', () => {
    const paradas = [p('a', '09:00'), p('b', '10:00'), p('c', '11:00')];

    // É o que a tela faz: troca o horário e reordena.
    const editada = paradas.map((x) => (x.obraId === 'c' ? p('c', '07:00') : x));
    const depois = ordenarPorHorario(editada);

    expect(depois.map((x) => x.obraId)).toEqual(['c', 'a', 'b']);
    expect(estaEmOrdemCrescente(depois)).toBe(true);
  });
});
