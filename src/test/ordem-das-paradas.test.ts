import { describe, it, expect } from 'vitest';
import {
  ordenarPorHorario,
  moverParadaMantendoHorarios,
  estaEmOrdemCrescente,
  agruparVisitasPorDia,
  ultimoHorarioUtilizavel,
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

describe('agruparVisitasPorDia — o card da aba Visitas', () => {
  const chave = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const v = (id: string, inicio: string) => ({ id, inicio });

  it('🔴 o card não lista mais a rota de trás para a frente', () => {
    // Como o banco entrega: `inicio` DECRESCENTE. Era essa ordem que ia para a tela.
    const doBanco = [
      v('c', '2026-08-28T16:00:00'),
      v('b', '2026-08-28T14:00:00'),
      v('a', '2026-08-28T09:00:00'),
    ];

    const dias = agruparVisitasPorDia(doBanco, chave);

    expect(dias).toHaveLength(1);
    expect(dias[0].visitasDoDia.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('os DIAS continuam do mais recente para o mais antigo', () => {
    const doBanco = [
      v('hoje', '2026-08-28T09:00:00'),
      v('ontem', '2026-08-27T15:00:00'),
      v('semana-passada', '2026-08-21T10:00:00'),
    ];

    expect(agruparVisitasPorDia(doBanco, chave).map((d) => d.chave)).toEqual([
      '2026-08-28',
      '2026-08-27',
      '2026-08-21',
    ]);
  });

  it('🔴 as duas ordens valem ao mesmo tempo, e são opostas', () => {
    const doBanco = [
      v('d2-tarde', '2026-08-28T17:00:00'),
      v('d2-cedo', '2026-08-28T08:00:00'),
      v('d1-tarde', '2026-08-27T18:00:00'),
      v('d1-cedo', '2026-08-27T07:30:00'),
    ];

    const dias = agruparVisitasPorDia(doBanco, chave);

    expect(dias.map((d) => d.chave)).toEqual(['2026-08-28', '2026-08-27']);
    expect(dias[0].visitasDoDia.map((x) => x.id)).toEqual(['d2-cedo', 'd2-tarde']);
    expect(dias[1].visitasDoDia.map((x) => x.id)).toEqual(['d1-cedo', 'd1-tarde']);
  });

  it('a ordem dos dias não depende de como a consulta veio', () => {
    // Mesmo se alguém trocar o `.order()` do hook para crescente, o topo continua o recente.
    const crescente = [
      v('antiga', '2026-08-21T10:00:00'),
      v('nova', '2026-08-28T09:00:00'),
    ];

    expect(agruparVisitasPorDia(crescente, chave).map((d) => d.chave)).toEqual([
      '2026-08-28',
      '2026-08-21',
    ]);
  });

  it('empate de horário cai no id, para a tela não variar entre duas aberturas', () => {
    const empatadas = [
      v('zeta', '2026-08-28T09:00:00'),
      v('alfa', '2026-08-28T09:00:00'),
    ];

    expect(agruparVisitasPorDia(empatadas, chave)[0].visitasDoDia.map((x) => x.id)).toEqual([
      'alfa',
      'zeta',
    ]);
  });

  it('visita futura e visita passada convivem no mesmo dia, em ordem', () => {
    const mistas = [
      v('planejada', '2026-08-28T15:00:00'),
      v('realizada', '2026-08-28T08:00:00'),
    ];

    expect(agruparVisitasPorDia(mistas, chave)[0].visitasDoDia.map((x) => x.id)).toEqual([
      'realizada',
      'planejada',
    ]);
  });

  it('lista vazia ou nula não explode', () => {
    expect(agruparVisitasPorDia([], chave)).toEqual([]);
    expect(agruparVisitasPorDia(null as never, chave)).toEqual([]);
  });

  it('não altera a lista original', () => {
    const original = [v('c', '2026-08-28T16:00:00'), v('a', '2026-08-28T09:00:00')];
    agruparVisitasPorDia(original, chave);
    expect(original.map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('ultimoHorarioUtilizavel — a obra que nascia à 1 da manhã', () => {
  it('🔴 parada SEM horário não pode virar a referência da próxima', () => {
    // A pessoa apagou o horário da obra do meio para redigitar.
    const comVazio = [p('a', '09:00'), p('b', ''), p('c', '11:00')];

    // `ordenarPorHorario` joga a vazia para o FIM. Se a sugestão olhasse só a última da lista
    // ordenada, ela pegaria a vazia — e `somarMinutos('')` conta da meia-noite: 01:00.
    expect(ordenarPorHorario(comVazio)[comVazio.length - 1].horario).toBe('');
    expect(ultimoHorarioUtilizavel(comVazio)).toBe('11:00');
  });

  it('devolve o horário mais tarde, mesmo com a lista fora de ordem', () => {
    const torta = [p('c', '15:00'), p('a', '09:00'), p('b', '11:00')];
    expect(ultimoHorarioUtilizavel(torta)).toBe('15:00');
  });

  it('devolve null quando NENHUMA parada tem horário — quem chama cai no 09:00', () => {
    expect(ultimoHorarioUtilizavel([])).toBeNull();
    expect(ultimoHorarioUtilizavel([p('a', ''), p('b', '')])).toBeNull();
  });

  it('horário quebrado conta como ausente, e não como meia-noite', () => {
    expect(ultimoHorarioUtilizavel([p('a', '09:00'), p('b', 'abc')])).toBe('09:00');
  });

  it('meia-noite de verdade continua valendo — 00:00 não é ausência', () => {
    expect(ultimoHorarioUtilizavel([p('a', '00:00')])).toBe('00:00');
  });
});
