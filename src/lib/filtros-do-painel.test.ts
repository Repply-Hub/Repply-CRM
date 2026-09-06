import { describe, it, expect } from 'vitest';
import { lerFiltrosDoEndereco, escreverFiltrosNoEndereco, type FiltrosDoPainel } from './filtros-do-painel';

const VAZIO: FiltrosDoPainel = { etapas: [], fabricantes: [], responsaveis: [] };

describe('filtros do painel no endereço', () => {
  it('endereço sem nada devolve tudo vazio', () => {
    expect(lerFiltrosDoEndereco(new URLSearchParams(''))).toEqual(VAZIO);
  });

  it('lê listas separadas por vírgula', () => {
    const p = new URLSearchParams('etapas=negociacao,proposta&fabricantes=abc');
    expect(lerFiltrosDoEndereco(p)).toEqual({
      etapas: ['negociacao', 'proposta'], fabricantes: ['abc'], responsaveis: [],
    });
  });

  // Um valor vazio entre vírgulas viraria um filtro por string vazia, que não casa com nada e
  // esvazia o painel sem explicação.
  it('descarta pedaço vazio', () => {
    expect(lerFiltrosDoEndereco(new URLSearchParams('etapas=,,negociacao,'))).toEqual({
      ...VAZIO, etapas: ['negociacao'],
    });
  });

  it('escrever tira do endereço o filtro que ficou vazio', () => {
    const antes = new URLSearchParams('etapas=negociacao&negocio=xyz');
    const depois = escreverFiltrosNoEndereco(antes, { ...VAZIO, fabricantes: ['abc'] });
    expect(depois.get('etapas')).toBeNull();
    expect(depois.get('fabricantes')).toBe('abc');
  });

  // O `?negocio=` é da Etapa 1 e abre a ficha do negócio. Escrever filtro não pode derrubá-lo.
  it('não mexe em parâmetro que não é dele', () => {
    const depois = escreverFiltrosNoEndereco(new URLSearchParams('negocio=xyz'), { ...VAZIO, etapas: ['a'] });
    expect(depois.get('negocio')).toBe('xyz');
  });

  it('ida e volta preserva o conteúdo', () => {
    const filtros: FiltrosDoPainel = { etapas: ['a', 'b'], fabricantes: ['c'], responsaveis: ['d'] };
    expect(lerFiltrosDoEndereco(escreverFiltrosNoEndereco(new URLSearchParams(''), filtros))).toEqual(filtros);
  });
});
