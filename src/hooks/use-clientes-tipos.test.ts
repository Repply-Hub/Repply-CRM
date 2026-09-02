import { describe, it, expect } from 'vitest';
import { slugDeTipo, rotuloDoTipo, tipoPadrao, opcoesDeFiltro } from '@/lib/tipos-de-cliente';

const LISTA = [
  { slug: 'construtora_ativa', nome: 'Construtora Ativa' },
  { slug: 'loja_ativa', nome: 'Loja Ativa' },
  { slug: 'pessoa fisica', nome: 'Pessoa Física' },
];

describe('slugDeTipo', () => {
  it('tira acento, baixa a caixa e junta com underscore', () => {
    expect(slugDeTipo('Construtora Inativa')).toBe('construtora_inativa');
    expect(slugDeTipo('  Pessoa Física  ')).toBe('pessoa_fisica');
  });

  it('devolve vazio quando o nome nao tem nenhum caractere aproveitavel', () => {
    expect(slugDeTipo('   ')).toBe('');
    expect(slugDeTipo('!!!')).toBe('');
  });
});

describe('rotuloDoTipo', () => {
  it('acha o rotulo pelo slug', () => {
    expect(rotuloDoTipo('construtora_ativa', LISTA)).toBe('Construtora Ativa');
  });

  it('cai no proprio valor quando o slug nao esta na lista', () => {
    // Um cliente gravado com um tipo que ja foi removido da lista continua legivel.
    expect(rotuloDoTipo('construtora - 3 níveis', LISTA)).toBe('construtora - 3 níveis');
  });
});

describe('tipoPadrao', () => {
  it('e o primeiro item da lista', () => {
    expect(tipoPadrao(LISTA)).toBe('construtora_ativa');
  });

  it('e vazio quando a lista ainda nao carregou', () => {
    expect(tipoPadrao([])).toBe('');
  });
});

describe('opcoesDeFiltro', () => {
  it('soma os tipos em uso que nao estao na lista, para nenhum cliente sumir da busca', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa', 'construtora']);
    expect(opcoes.map(o => o.value)).toEqual([
      'construtora_ativa', 'loja_ativa', 'pessoa fisica', 'construtora',
    ]);
    expect(opcoes.find(o => o.value === 'construtora')?.label).toBe('construtora');
  });

  it('nao duplica um tipo que esta na lista e em uso', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa']);
    expect(opcoes).toHaveLength(3);
  });
});
