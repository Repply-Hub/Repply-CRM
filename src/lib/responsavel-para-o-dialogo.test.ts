import { describe, it, expect } from 'vitest';
import { responsavelParaODialogo } from './responsavel-para-o-dialogo';

/**
 * O QUE ESTE ARQUIVO PRENDE: o "é meu?" do "Retomar depois" clicado na tabela do time. Decidido
 * pelo NOME, dois homônimos na mesma empresa faziam o diálogo dizer "volta para a sua pauta" sobre
 * o negócio do colega (item 69 da dívida técnica). Pelo identificador, não erra — e, sem
 * identificador (site novo com o banco antigo), volta a comparar o nome.
 */
describe('responsavelParaODialogo', () => {
  const eu = { id: 'u-1', nome: 'Ana Souza' };

  it('mesmo identificador: o negócio é meu, o diálogo não nomeia ninguém', () => {
    expect(responsavelParaODialogo({ responsavel: 'Ana Souza', responsavel_id: 'u-1' }, eu)).toBeNull();
  });

  it('🔴 homônimo com outro identificador: o negócio é do colega', () => {
    expect(responsavelParaODialogo({ responsavel: 'Ana Souza', responsavel_id: 'u-2' }, eu)).toBe('Ana Souza');
  });

  it('sem identificador, compara o nome como antes', () => {
    expect(responsavelParaODialogo({ responsavel: ' ana souza ', responsavel_id: null }, eu)).toBeNull();
    expect(responsavelParaODialogo({ responsavel: 'Bruno Lima' }, eu)).toBe('Bruno Lima');
  });

  it('sem dono, não há quem nomear', () => {
    expect(responsavelParaODialogo({ responsavel: null, responsavel_id: 'u-2' }, eu)).toBeNull();
    expect(responsavelParaODialogo({ responsavel: '   ' }, eu)).toBeNull();
  });
});
