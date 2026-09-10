import { describe, it, expect } from 'vitest';
import {
  lerFiltrosDoEndereco,
  escreverFiltrosNoEndereco,
  recorteParaOServidor,
  type FiltrosDoPainel,
} from './filtros-do-painel';

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

/**
 * A tradução para as consultas. Três lugares a usam — o painel de números, a tabela do time e a
 * contagem que a tela "Hoje" lê para saber se a fila vazia pode comemorar —, e é justamente por
 * serem três que ela precisa ser uma só: se um deles mandar um recorte diferente, a tela mostra um
 * número que a tabela logo abaixo contradiz.
 */
describe('recorte que vai para o servidor', () => {
  const CHEIO: FiltrosDoPainel = { etapas: ['proposta'], fabricantes: ['fab-1'], responsaveis: ['usr-1'] };

  it('renomeia os campos para o que a consulta espera', () => {
    expect(recorteParaOServidor(CHEIO, true)).toEqual({
      etapas: ['proposta'],
      fabricanteIds: ['fab-1'],
      usuarioIds: ['usr-1'],
    });
  });

  // 🔴 O caso que já foi bug: os filtros moram no endereço, e revogar a chave de alguém não limpa
  // o `?responsaveis=` que essa pessoa tinha salvo. Sem esta regra o controle some da barra e o
  // recorte continua valendo, com os números respondendo a algo que não está mais na tela.
  it('sem a chave, o responsável NÃO vai para o servidor nem que esteja no endereço', () => {
    expect(recorteParaOServidor(CHEIO, false).usuarioIds).toBeUndefined();
  });

  // `undefined` é "sem filtro"; `[]` viraria `= ANY('{}')`, que não casa com nada (CLAUDE.md
  // §7.8). Aqui a lista vazia é repassada como lista vazia de propósito — quem converte para
  // `null` é o hook, num lugar só, e o mesmo para os quatro filtros.
  it('sem responsável escolhido, com a chave, repassa a lista vazia', () => {
    expect(recorteParaOServidor({ ...CHEIO, responsaveis: [] }, true).usuarioIds).toEqual([]);
  });
});
