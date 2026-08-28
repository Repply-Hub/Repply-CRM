import { describe, it, expect } from 'vitest';
import { anosDeEdicao } from './anos-de-edicao';

describe('anosDeEdicao', () => {
  it('oferece doze anos, do ano que vem até dez atrás', () => {
    const anos = anosDeEdicao(2026);
    expect(anos).toHaveLength(12);
    expect(anos[0]).toBe(2027);
    expect(anos[anos.length - 1]).toBe(2016);
  });

  it('vem em ordem decrescente, para o ano corrente ficar no alto', () => {
    const anos = anosDeEdicao(2026);
    expect(anos).toEqual([...anos].sort((a, b) => b - a));
    // O ano corrente é o segundo item: só o "ano que vem" fica acima dele.
    expect(anos[1]).toBe(2026);
  });

  it('nunca oferece ano que a restrição do banco recusaria', () => {
    // 2000–2100 é o `check` da migration. Nas bordas a faixa encolhe em vez de vazar.
    expect(anosDeEdicao(2002)).toEqual([2003, 2002, 2001, 2000]);
    expect(anosDeEdicao(2100)[0]).toBe(2100);
  });

  it('encaixa o ano do arquivo que está sendo editado, na ordem certa', () => {
    // Sem isto, editar um material de 2014 abriria com o seletor vazio e salvar trocaria a
    // edição sem ninguém ter pedido.
    const anos = anosDeEdicao(2026, 2014);
    expect(anos).toHaveLength(13);
    expect(anos[anos.length - 1]).toBe(2014);

    const comFuturo = anosDeEdicao(2026, 2030);
    expect(comFuturo[0]).toBe(2030);
    expect(comFuturo[1]).toBe(2027);
  });

  it('não duplica o ano já presente na faixa', () => {
    expect(anosDeEdicao(2026, 2026)).toHaveLength(12);
  });

  it('ignora ano ausente ou fora do que o banco aceita', () => {
    expect(anosDeEdicao(2026, null)).toHaveLength(12);
    expect(anosDeEdicao(2026, undefined)).toHaveLength(12);
    expect(anosDeEdicao(2026, 1999)).toHaveLength(12);
    expect(anosDeEdicao(2026, 2101)).toHaveLength(12);
    expect(anosDeEdicao(2026, Number.NaN)).toHaveLength(12);
  });
});
