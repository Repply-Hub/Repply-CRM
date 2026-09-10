import { describe, it, expect } from 'vitest';
import { avisoDaTarefaDoRetorno } from './aviso-da-tarefa-do-retorno';

/**
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A frase de ajuda da caixinha "Criar tarefa para o responsável" promete duas coisas —
 * PARA QUEM a tarefa vai e QUANDO ela vence. As duas são fáceis de errar em silêncio:
 *
 *   · a concordância muda conforme o negócio é meu ou de um colega, e o diálogo recebe
 *     essa informação num campo cujo NULO significa "é meu", não "não sei de quem é";
 *   · a data chega como texto `AAAA-MM-DD` e qualquer volta por `new Date(...)` a recua um
 *     dia no horário de Brasília (CLAUDE.md §7.12) — a frase prometeria um dia e o banco
 *     gravaria outro.
 *
 * Por isso a decisão vive numa função pura, testada sem montar React.
 */
describe('avisoDaTarefaDoRetorno', () => {
  it('diz o nome do dono quando o negócio é de um colega', () => {
    expect(avisoDaTarefaDoRetorno('Érika Marques', '2026-09-15')).toBe(
      'A tarefa vai para Érika Marques, com prazo em 15/09.',
    );
  });

  it('fala com você quando o negócio é seu (dono nulo)', () => {
    expect(avisoDaTarefaDoRetorno(null, '2026-09-15')).toBe(
      'A tarefa fica com você, com prazo em 15/09.',
    );
  });

  /**
   * 🔴 O TESTE QUE PEGA O FUSO. `new Date("2026-10-01")` lê o texto como UTC e, no horário
   * de Brasília, devolve 30/09 — a frase diria SETEMBRO para uma tarefa que vence em
   * OUTUBRO. Dia 1º é onde o erro de fuso troca o MÊS, não só o dia, e é por isso que a
   * data é recortada do texto em vez de virar `Date`.
   */
  it('não recua o dia 1º para o mês anterior', () => {
    expect(avisoDaTarefaDoRetorno(null, '2026-10-01')).toContain('01/10');
    expect(avisoDaTarefaDoRetorno('Érika Marques', '2026-01-01')).toContain('01/01');
  });

  it('não escorrega no primeiro dia do ano (que recuaria para dezembro do ano anterior)', () => {
    expect(avisoDaTarefaDoRetorno(null, '2027-01-01')).toBe(
      'A tarefa fica com você, com prazo em 01/01.',
    );
  });

  /**
   * A fila manda `item.responsavel` cru, e o que vem do banco pode ser texto vazio em vez
   * de nulo. Vazio é "é meu" pelo mesmo motivo que nulo: o campo só se preenche quando o
   * negócio é de OUTRA pessoa. Sem isto a frase viraria "A tarefa vai para , com prazo…".
   */
  it('trata nome vazio ou só com espaços como negócio próprio', () => {
    expect(avisoDaTarefaDoRetorno('', '2026-09-15')).toBe(
      'A tarefa fica com você, com prazo em 15/09.',
    );
    expect(avisoDaTarefaDoRetorno('   ', '2026-09-15')).toBe(
      'A tarefa fica com você, com prazo em 15/09.',
    );
  });

  it('não cola espaço em volta do nome do colega', () => {
    expect(avisoDaTarefaDoRetorno('  Érika Marques  ', '2026-09-15')).toBe(
      'A tarefa vai para Érika Marques, com prazo em 15/09.',
    );
  });
});
