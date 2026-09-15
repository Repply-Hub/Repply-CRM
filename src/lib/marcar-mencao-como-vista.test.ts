import { describe, it, expect } from 'vitest';
import { deveMarcarMencaoComoVista } from './marcar-mencao-como-vista';

/**
 * Trava do achado I-2 (revisão final do Bloco 4): o @ só pode sumir quando a
 * pessoa de fato ABRE a conversa. Antes do conserto, o alvo nascia sempre no
 * Geral e a menção dele era marcada como vista antes de qualquer efeito de
 * `?conversa=` trocar de alvo — e, no celular, mesmo com só a LISTA na tela.
 */
describe('deveMarcarMencaoComoVista', () => {
  it('desktop com o Geral selecionado e menção não lida: marca', () => {
    expect(
      deveMarcarMencaoComoVista({
        tipoDoAlvo: 'geral',
        temMencaoNaoLida: true,
        isMobile: false,
        painelCelular: 'lista', // desktop não olha o painel do celular
      }),
    ).toBe(true);
  });

  it('celular mostrando a LISTA: não marca, mesmo com o alvo já selecionado por baixo dos panos', () => {
    expect(
      deveMarcarMencaoComoVista({
        tipoDoAlvo: 'geral',
        temMencaoNaoLida: true,
        isMobile: true,
        painelCelular: 'lista',
      }),
    ).toBe(false);
  });

  it('celular mostrando a CONVERSA: marca', () => {
    expect(
      deveMarcarMencaoComoVista({
        tipoDoAlvo: 'grupo',
        temMencaoNaoLida: true,
        isMobile: true,
        painelCelular: 'conversa',
      }),
    ).toBe(true);
  });

  it('conversa direta (dm): nunca marca aqui, mesmo com a conversa na tela', () => {
    expect(
      deveMarcarMencaoComoVista({
        tipoDoAlvo: 'dm',
        temMencaoNaoLida: true,
        isMobile: false,
        painelCelular: 'conversa',
      }),
    ).toBe(false);
  });

  it('sem menção não lida: não marca', () => {
    expect(
      deveMarcarMencaoComoVista({
        tipoDoAlvo: 'geral',
        temMencaoNaoLida: false,
        isMobile: false,
        painelCelular: 'conversa',
      }),
    ).toBe(false);
  });
});
