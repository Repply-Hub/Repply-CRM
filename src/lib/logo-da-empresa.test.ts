import { describe, it, expect } from 'vitest';
import { escalaParaCaber, quaseInvisivelNoBranco, caminhoDaLogo, MAIOR_LADO } from './logo-da-empresa';

/**
 * O preparo do arquivo de logo antes de subir.
 *
 * As três decisões que este arquivo fixa: encolher sem esticar, avisar sobre logo clara sem
 * recusá-la, e o caminho por EMPRESA — que é o que impede uma empresa de sobrescrever a logo
 * da outra, como acontecia no caminho global `logo-email.png`.
 */

/** Monta os dados crus de um canvas: cada pixel são 4 números (R, G, B, opacidade). */
function pixels(...cores: Array<[number, number, number, number]>): number[] {
  return cores.flat();
}

describe('escalaParaCaber', () => {
  it('não estica imagem pequena', () => {
    // Esticar deixaria a logo borrada no PDF, e o arquivo maior por nada.
    expect(escalaParaCaber(120, 60)).toBe(1);
    expect(escalaParaCaber(MAIOR_LADO, MAIOR_LADO)).toBe(1);
  });

  it('encolhe pelo maior lado, seja ele qual for', () => {
    expect(escalaParaCaber(1200, 300)).toBeCloseTo(0.5);
    expect(escalaParaCaber(300, 1200)).toBeCloseTo(0.5);
  });

  it('imagem sem tamanho não quebra a conta', () => {
    expect(escalaParaCaber(0, 0)).toBe(1);
  });
});

describe('quaseInvisivelNoBranco', () => {
  it('🔴 logo branca com fundo vazado é o caso que precisa de aviso', () => {
    // É a versão da marca feita para fundo escuro. No papel branco do PDF ela some, e a pessoa
    // só descobriria abrindo o arquivo já enviado ao cliente.
    expect(quaseInvisivelNoBranco(pixels([255, 255, 255, 255], [250, 250, 250, 255]))).toBe(true);
  });

  it('🔴 fundo transparente NÃO conta — senão toda logo vazada seria acusada', () => {
    // Uma logo preta sobre fundo transparente é o formato mais comum que existe.
    expect(
      quaseInvisivelNoBranco(pixels([0, 0, 0, 0], [0, 0, 0, 0], [20, 20, 20, 255])),
    ).toBe(false);
  });

  it('logo escura passa sem aviso', () => {
    expect(quaseInvisivelNoBranco(pixels([10, 10, 10, 255], [40, 40, 40, 255]))).toBe(false);
  });

  it('logo colorida passa — o que importa é a luminância, não a cor', () => {
    // Laranja da marca: claro em vermelho, mas escuro o bastante para aparecer no branco.
    expect(quaseInvisivelNoBranco(pixels([255, 90, 31, 255]))).toBe(false);
  });

  it('a fronteira do aviso é 90% de pixels claros', () => {
    const brancos = (n: number) =>
      Array.from({ length: n }, () => [255, 255, 255, 255] as [number, number, number, number]);

    // 9 de 10 claros = exatamente 90%: avisa.
    expect(quaseInvisivelNoBranco(pixels(...brancos(9), [0, 0, 0, 255]))).toBe(true);
    // 8 de 10 = 80%: há desenho escuro suficiente para aparecer no papel.
    expect(quaseInvisivelNoBranco(pixels(...brancos(8), [0, 0, 0, 255], [0, 0, 0, 255]))).toBe(false);
  });

  it('imagem totalmente vazia também some no papel', () => {
    expect(quaseInvisivelNoBranco(pixels([0, 0, 0, 0], [0, 0, 0, 0]))).toBe(true);
    expect(quaseInvisivelNoBranco([])).toBe(true);
  });
});

describe('caminhoDaLogo', () => {
  it('🔴 a pasta é a EMPRESA — é o que separa uma da outra no balde', () => {
    expect(caminhoDaLogo('9b17bfdf-f631-4af6-9471-a68411909a04')).toBe(
      '9b17bfdf-f631-4af6-9471-a68411909a04/logo.png',
    );
  });
});
