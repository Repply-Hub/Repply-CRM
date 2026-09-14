import { equipeRecolhidaEfetiva, painelVisivelNoCelular } from './painel-do-chat-no-celular';

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

/**
 * Guarda contra o achado da revisão do commit ee4ded63: recolher a equipe em
 * ≥768px e depois estreitar a janela sem remontar `/chat` não pode deixar a
 * lista presa na versão de ícones (`w-12`) quando a regra do celular manda
 * ela ocupar a largura inteira.
 */
describe('equipeRecolhidaEfetiva', () => {
  it('respeita o recolhimento manual quando não é celular (comportamento de hoje em ≥md)', () => {
    expect(equipeRecolhidaEfetiva(true, false)).toBe(true);
    expect(equipeRecolhidaEfetiva(false, false)).toBe(false);
  });

  it('no celular nunca recolhe, mesmo que o estado tenha ficado `true` de quando a janela era larga', () => {
    expect(equipeRecolhidaEfetiva(true, true)).toBe(false);
  });

  it('no celular sem recolhimento pendente continua não recolhido', () => {
    expect(equipeRecolhidaEfetiva(false, true)).toBe(false);
  });
});
