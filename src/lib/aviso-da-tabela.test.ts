import { describe, it, expect } from 'vitest';
import { fraseDoAvisoDaTabela } from './aviso-da-tabela';

/**
 * O QUE ESTE ARQUIVO PRENDE: o aviso da pauta vazia diz "pedem atenção", nunca "parados" — a
 * tabela lista `parado OR sem_proxima_acao`, e chamar tudo de "parado" contaria errado. E fala dos
 * negócios DA PESSOA quando ela não tem a chave `pauta_de_todos`.
 */
describe('fraseDoAvisoDaTabela', () => {
  it('sem negócio na tabela, não há aviso', () => {
    expect(fraseDoAvisoDaTabela(0, true)).toBeNull();
    expect(fraseDoAvisoDaTabela(-1, true)).toBeNull();
    expect(fraseDoAvisoDaTabela(Number.NaN, false)).toBeNull();
  });

  it('com a chave, fala dos negócios que a tabela mostra', () => {
    expect(fraseDoAvisoDaTabela(145, true)).toBe(
      'Quer adiantar? Os 145 negócios que pedem atenção estão na tabela logo abaixo.',
    );
    expect(fraseDoAvisoDaTabela(1, true)).toBe(
      'Quer adiantar? O negócio que pede atenção está na tabela logo abaixo.',
    );
  });

  it('sem a chave, fala dos negócios da pessoa', () => {
    expect(fraseDoAvisoDaTabela(12, false)).toBe(
      'Quer adiantar? Seus 12 negócios que pedem atenção estão na tabela logo abaixo.',
    );
    expect(fraseDoAvisoDaTabela(1, false)).toBe(
      'Quer adiantar? Seu negócio que pede atenção está na tabela logo abaixo.',
    );
  });
});
