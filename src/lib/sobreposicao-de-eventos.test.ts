import { describe, it, expect } from 'vitest';
import { distribuirEmColunas } from './sobreposicao-de-eventos';

/** Um evento fictício: só precisa de início e fim para o cálculo. */
const ev = (id: string, hInicio: number, hFim: number) => ({
  id,
  inicio: new Date(2026, 7, 27, hInicio, 0),
  fim: new Date(2026, 7, 27, hFim, 0),
});

type EventoDeTeste = ReturnType<typeof ev>;

const mapa = (r: Array<{ evento: EventoDeTeste; coluna: number; colunas: number }>) =>
  Object.fromEntries(r.map((x) => [x.evento.id, [x.coluna, x.colunas]]));

describe('distribuirEmColunas', () => {
  it('evento sozinho ocupa a largura inteira', () => {
    expect(mapa(distribuirEmColunas([ev('a', 9, 10)]))).toEqual({ a: [0, 1] });
  });

  it('🔴 dois no mesmo horário ficam LADO A LADO, não um em cima do outro', () => {
    // Este é o defeito: sem cálculo os dois recebiam a mesma posição, o de baixo ficava
    // totalmente coberto e não dava nem para clicar nele.
    const r = mapa(distribuirEmColunas([ev('a', 9, 10), ev('b', 9, 10)]));
    expect(r.a).toEqual([0, 2]);
    expect(r.b).toEqual([1, 2]);
  });

  it('quem não se encosta volta a ocupar a largura inteira', () => {
    const r = mapa(distribuirEmColunas([ev('a', 9, 10), ev('b', 11, 12)]));
    expect(r.a).toEqual([0, 1]);
    expect(r.b).toEqual([0, 1]);
  });

  it('🔴 terminar na hora em que o outro começa NÃO é sobreposição', () => {
    // 9h–10h e 10h–11h são consecutivos. Tratar isso como choque estreitaria metade da agenda
    // de quem marca compromissos colados, que é o caso comum.
    const r = mapa(distribuirEmColunas([ev('a', 9, 10), ev('b', 10, 11)]));
    expect(r.a).toEqual([0, 1]);
    expect(r.b).toEqual([0, 1]);
  });

  it('três no mesmo horário viram três colunas', () => {
    const r = mapa(distribuirEmColunas([ev('a', 9, 10), ev('b', 9, 10), ev('c', 9, 10)]));
    expect([r.a, r.b, r.c]).toEqual([[0, 3], [1, 3], [2, 3]]);
  });

  it('a coluna livre é REAPROVEITADA quando o anterior já acabou', () => {
    // a: 9–12 (longo). b: 9–10. c: 10–11 cabe embaixo do b, na mesma coluna.
    // Sem reaproveitar, c abriria uma terceira coluna e tudo ficaria fino à toa.
    const r = mapa(distribuirEmColunas([ev('a', 9, 12), ev('b', 9, 10), ev('c', 10, 11)]));
    expect(r.a[0]).toBe(0);
    expect(r.b[0]).toBe(1);
    expect(r.c[0]).toBe(1);
    expect(r.a[1]).toBe(2); // duas colunas no grupo todo
  });

  it('🔴 o grupo inteiro compartilha a MESMA contagem de colunas', () => {
    // Se cada evento calculasse a sua largura sozinho, blocos do mesmo choque ficariam com
    // larguras diferentes e sobrariam faixas brancas no meio da agenda.
    const r = distribuirEmColunas([ev('a', 9, 12), ev('b', 9, 10), ev('c', 10, 11)]);
    expect(new Set(r.map((x) => x.colunas)).size).toBe(1);
  });

  it('uma corrente encadeada continua sendo UM grupo só', () => {
    // a encosta em b, b encosta em c, mas a NÃO encosta em c. Ainda assim os três dividem o
    // espaço, senão a e c se sobreporiam na mesma coluna.
    const r = mapa(distribuirEmColunas([ev('a', 9, 11), ev('b', 10, 12), ev('c', 11, 13)]));
    expect(r.a[1]).toBe(r.b[1]);
  });

  it('a ordem de entrada não muda a LARGURA de ninguém', () => {
    // Qual dos dois idênticos fica à esquerda é arbitrário — e tudo bem. O que não pode variar
    // é em quantas fatias o espaço foi dividido: isso mudaria a largura dos blocos na tela.
    const eventos = [ev('c', 9, 10), ev('a', 8, 11), ev('b', 9, 10)];
    const larguras = (es: typeof eventos) =>
      Object.fromEntries(distribuirEmColunas(es).map((x) => [x.evento.id, x.colunas]));
    expect(larguras(eventos)).toEqual(larguras([...eventos].reverse()));
  });

  it('🔴 dois que se sobrepõem NUNCA caem na mesma coluna', () => {
    // É a garantia que importa de verdade: coluna repetida = bloco escondido atrás do outro,
    // que era exatamente o defeito. Vale para qualquer ordem de entrada.
    const eventos = [ev('a', 8, 11), ev('b', 9, 10), ev('c', 9, 10), ev('d', 10, 13), ev('e', 12, 14)];
    for (const entrada of [eventos, [...eventos].reverse()]) {
      const r = distribuirEmColunas(entrada);
      for (const x of r) {
        for (const y of r) {
          if (x === y) continue;
          const seSobrepoem =
            x.evento.inicio < y.evento.fim && y.evento.inicio < x.evento.fim;
          if (seSobrepoem) expect(x.coluna).not.toBe(y.coluna);
        }
      }
    }
  });

  it('todo evento que entra também sai — nenhum some', () => {
    const eventos = [ev('a', 9, 10), ev('b', 9, 11), ev('c', 14, 15), ev('d', 9, 10)];
    const r = distribuirEmColunas(eventos);
    expect(r).toHaveLength(4);
    expect(new Set(r.map((x) => x.evento.id)).size).toBe(4);
  });

  it('evento de duração zero não trava nem some', () => {
    const r = distribuirEmColunas([ev('a', 9, 9), ev('b', 9, 10)]);
    expect(r).toHaveLength(2);
  });

  it('fim antes do início não quebra o cálculo', () => {
    // Dado torto existe na base; a agenda tem que continuar desenhando o resto.
    const r = distribuirEmColunas([ev('a', 11, 9), ev('b', 9, 10)]);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.colunas >= 1 && x.coluna < x.colunas)).toBe(true);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(distribuirEmColunas([])).toEqual([]);
  });

  it('a coluna sempre cabe dentro da contagem', () => {
    const eventos = [ev('a', 9, 17), ev('b', 9, 10), ev('c', 9, 11), ev('d', 10, 12), ev('e', 16, 18)];
    for (const x of distribuirEmColunas(eventos)) {
      expect(x.coluna).toBeGreaterThanOrEqual(0);
      expect(x.coluna).toBeLessThan(x.colunas);
    }
  });
});
