import { painelVisivelNoCelular } from './painel-do-chat-no-celular';

/**
 * Guarda contra inverter sem querer a condição que decide o painel — é o tipo
 * de troca de ramo que não dá erro de tipo nem de lint, só quebra a tela.
 */
describe('painelVisivelNoCelular', () => {
  it('começa mostrando a lista (estado inicial, mesmo alvo padrão sendo o Geral)', () => {
    expect(painelVisivelNoCelular(false)).toBe('lista');
  });

  it('depois de escolher uma conversa, mostra só a conversa', () => {
    expect(painelVisivelNoCelular(true)).toBe('conversa');
  });
});
