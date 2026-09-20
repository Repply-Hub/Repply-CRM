import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsMobile } from './use-mobile';
import { deveMarcarMencaoComoVista } from '@/lib/marcar-mencao-como-vista';

/**
 * Trava do achado crítico da revisão do commit 2ca6c4c8 (Bloco 4, menções):
 * `useIsMobile` nascia sempre com `useState(undefined)`, e o valor real só
 * chegava dentro do `useEffect` do hook, depois do primeiro render. Nesse
 * primeiro instante `!!undefined` vale `false` — desktop —, mesmo com a tela
 * aberta num celular de verdade. Quem decide algo a partir desse primeiro
 * valor (como `deveMarcarMencaoComoVista` em `Chat.tsx`) errava justo ali: no
 * celular, tocar num aviso e cair em `/chat` (que só mostra a LISTA) já
 * marcava o @ do Geral como visto no efeito que roda logo na montagem.
 *
 * O `renderHook` do Testing Library resolve o `useEffect` pendente antes de
 * devolver o controle (o `act` interno flusha os efeitos), então
 * `result.current` já reflete o estado PÓS-efeito e não serve para flagrar
 * este bug. Por isso o teste empurra o valor devolvido a cada render para um
 * array, de dentro do próprio corpo do componente que o `renderHook` monta —
 * ou seja, antes de qualquer efeito rodar — e confere a posição 0: o valor
 * do PRIMEIRO render.
 */
const larguraOriginal = window.innerWidth;

function comLargura(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
}

afterEach(() => {
  comLargura(larguraOriginal);
});

describe('useIsMobile', () => {
  it('celular: o primeiro render já devolve true, antes do efeito rodar', () => {
    comLargura(400); // abaixo do limite de 768
    const valores: boolean[] = [];
    renderHook(() => {
      valores.push(useIsMobile());
    });
    expect(valores[0]).toBe(true);
  });

  it('desktop: o primeiro render já devolve false', () => {
    comLargura(1280);
    const valores: boolean[] = [];
    renderHook(() => {
      valores.push(useIsMobile());
    });
    expect(valores[0]).toBe(false);
  });
});

describe('composição com deveMarcarMencaoComoVista (prova sem montar Chat.tsx inteira)', () => {
  it('no celular, o primeiro render já sabe que é celular — a decisão de marcar o Geral como visto nasce "não", igual à tela mostrando só a lista', () => {
    comLargura(400);
    const decisoes: boolean[] = [];
    renderHook(() => {
      const isMobile = useIsMobile();
      // Mesma composição que `Chat.tsx` faz: `painelCelular` começa 'lista'
      // até a pessoa abrir uma conversa (`mostrarConversaNoCelular` nasce
      // `false`, independente deste hook).
      decisoes.push(
        deveMarcarMencaoComoVista({
          tipoDoAlvo: 'geral',
          temMencaoNaoLida: true,
          isMobile,
          painelCelular: 'lista',
        }),
      );
    });
    expect(decisoes[0]).toBe(false);
  });
});
