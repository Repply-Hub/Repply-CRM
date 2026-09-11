import { describe, it, expect } from 'vitest';
import { avisoDaTarefaDoRetorno, rotuloDaTarefaDoRetorno } from './aviso-da-tarefa-do-retorno';

/**
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * As duas linhas da caixinha "Criar tarefa" prometem três coisas — PARA QUEM a tarefa vai,
 * QUANDO ela vence e O QUE vai escrito nela. Duas são fáceis de errar em silêncio:
 *
 *   · a concordância muda conforme o negócio é meu ou de um colega, e o diálogo recebe essa
 *     informação num campo cujo NULO significa "é meu", não "não sei de quem é";
 *   · a data chega como texto `AAAA-MM-DD` e qualquer volta por `new Date(...)` a recua um dia
 *     no horário de Brasília (CLAUDE.md §7.12) — a frase prometeria um dia e o banco gravaria
 *     outro.
 *
 * Por isso a decisão vive em funções puras, testadas sem montar React.
 */

/**
 * 🔴 A PRECONDIÇÃO DO TESTE DE FUSO, presa aqui de propósito.
 *
 * O caso "não recua o dia 1º" só tem valor numa máquina ATRÁS de UTC: em UTC,
 * `new Date("2026-10-01")` devolve 01/10 e o defeito passaria despercebido. `src/test/setup.ts`
 * crava `TZ=America/Fortaleza` exatamente por isso — e este teste é o que avisa se alguém tirar
 * a cravação, em vez de deixar o teste de baixo virar enfeite em silêncio.
 */
describe('o fuso dos testes', () => {
  it('está atrás de UTC — sem isso o teste do dia 1º não prova nada', () => {
    const comoDateLeria = new Date('2026-10-01');
    expect(comoDateLeria.getMonth()).toBe(8); // setembro, não outubro
    expect(comoDateLeria.getDate()).toBe(30);
  });
});

describe('rotuloDaTarefaDoRetorno', () => {
  it('diz o nome do dono quando o negócio é de um colega', () => {
    expect(rotuloDaTarefaDoRetorno('Érika Marques')).toBe('Criar tarefa para Érika Marques');
  });

  it('fala na primeira pessoa quando o negócio é seu (dono nulo)', () => {
    expect(rotuloDaTarefaDoRetorno(null)).toBe('Criar uma tarefa para mim');
  });

  /**
   * A fila manda `item.responsavel` cru, e o que vem do banco pode ser texto vazio em vez de
   * nulo. Vazio é "é meu" pelo mesmo motivo que nulo: o campo só se preenche quando o negócio é
   * de OUTRA pessoa. Sem isto o rótulo viraria "Criar tarefa para ".
   */
  it('trata nome vazio ou só com espaços como negócio próprio', () => {
    expect(rotuloDaTarefaDoRetorno('')).toBe('Criar uma tarefa para mim');
    expect(rotuloDaTarefaDoRetorno('   ')).toBe('Criar uma tarefa para mim');
  });

  it('não cola espaço em volta do nome do colega', () => {
    expect(rotuloDaTarefaDoRetorno('  Érika Marques  ')).toBe('Criar tarefa para Érika Marques');
  });
});

describe('avisoDaTarefaDoRetorno', () => {
  it('diz o prazo e que o motivo vai junto', () => {
    expect(avisoDaTarefaDoRetorno('2026-09-15')).toBe(
      'Prazo em 15/09, e o motivo acima vai na descrição.',
    );
  });

  /**
   * 🔴 O TESTE QUE PEGA O FUSO. `new Date("2026-10-01")` lê o texto como UTC e, no horário de
   * Brasília, devolve 30/09 — a frase diria SETEMBRO para uma tarefa que vence em OUTUBRO. Dia
   * 1º é onde o erro de fuso troca o MÊS, não só o dia, e é por isso que a data é recortada do
   * texto em vez de virar `Date`. A precondição está presa no primeiro `describe` deste arquivo.
   */
  it('não recua o dia 1º para o mês anterior', () => {
    expect(avisoDaTarefaDoRetorno('2026-10-01')).toContain('01/10');
  });

  it('não escorrega no primeiro dia do ano (que recuaria para dezembro do ano anterior)', () => {
    expect(avisoDaTarefaDoRetorno('2027-01-01')).toContain('01/01');
  });
});
