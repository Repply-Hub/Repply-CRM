import { describe, it, expect } from 'vitest';
import {
  clienteDoContato,
  contatosDoCliente,
  contatosForaDoCliente,
} from './vinculo-contato-cliente';

/**
 * O que estes testes protegem, e por quê.
 *
 * O defeito original não era um erro de lógica: era a regra escrita à mão em três lugares,
 * comparando o TEXTO do nome da empresa. Casava em 0 de 2.013 contatos e ninguém percebeu, porque
 * "nenhum negócio" e "nenhum contato" são telas plausíveis.
 *
 * Por isso os testes fixam três coisas: que o casamento é pela CHAVE (nome igual não basta, nome
 * diferente não atrapalha), que contato sem vínculo é um estado válido, e que as duas listas são
 * COMPLEMENTARES — a propriedade que, quando se quebrou, fez a mesma pessoa aparecer nas duas.
 */

const CLIENTES = [
  { id: 'c1', empresa: 'LMT Construções e Incorporações Ltda' },
  { id: 'c2', empresa: 'Mareng Engenharia' },
];

const CONTATOS = [
  { id: 'p1', nome: 'Ana', cliente_id: 'c1', empresa: 'LMT Construcoes e Incorporacoes LTDA' },
  { id: 'p2', nome: 'Bruno', cliente_id: 'c1', empresa: null },
  { id: 'p3', nome: 'Carla', cliente_id: 'c2', empresa: 'Mareng Engenharia' },
  { id: 'p4', nome: 'Davi', cliente_id: null, empresa: 'Alguma Construtora' },
];

describe('clienteDoContato', () => {
  it('🔴 acha pela chave mesmo quando o nome escrito é diferente', () => {
    // É o caso real: o contato veio da importação sem acento, o cliente tem acento.
    const contato = CONTATOS[0];
    expect(contato.empresa).not.toBe(CLIENTES[0].empresa); // os textos NÃO batem
    expect(clienteDoContato(CLIENTES, contato)?.id).toBe('c1'); // e mesmo assim acha
  });

  it('acha quando o contato nem tem o nome da empresa escrito', () => {
    expect(clienteDoContato(CLIENTES, CONTATOS[1])?.id).toBe('c1');
  });

  it('contato sem vínculo devolve indefinido — é estado válido, não erro', () => {
    expect(clienteDoContato(CLIENTES, CONTATOS[3])).toBeUndefined();
  });

  it('não inventa cliente quando a chave aponta para alguém que não está na lista', () => {
    expect(clienteDoContato(CLIENTES, { cliente_id: 'nao-existe' })).toBeUndefined();
  });

  it('aguenta lista e contato vazios', () => {
    expect(clienteDoContato(undefined, CONTATOS[0])).toBeUndefined();
    expect(clienteDoContato(CLIENTES, null)).toBeUndefined();
    expect(clienteDoContato(null, undefined)).toBeUndefined();
  });
});

describe('contatosDoCliente', () => {
  it('traz só quem tem a chave daquele cliente', () => {
    expect(contatosDoCliente(CONTATOS, 'c1').map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(contatosDoCliente(CONTATOS, 'c2').map((c) => c.id)).toEqual(['p3']);
  });

  it('não traz quem tem só o nome da empresa parecido', () => {
    const so_texto = [{ id: 'x', cliente_id: null, empresa: 'Mareng Engenharia' }];
    expect(contatosDoCliente(so_texto, 'c2')).toEqual([]);
  });

  it('sem cliente devolve lista vazia, nunca a lista inteira', () => {
    expect(contatosDoCliente(CONTATOS, null)).toEqual([]);
    expect(contatosDoCliente(CONTATOS, undefined)).toEqual([]);
  });
});

describe('contatosForaDoCliente', () => {
  it('traz quem é de outro cliente e quem não tem vínculo', () => {
    expect(contatosForaDoCliente(CONTATOS, 'c1').map((c) => c.id)).toEqual(['p3', 'p4']);
  });

  it('sem cliente devolve todo mundo — ainda não dá para excluir ninguém', () => {
    expect(contatosForaDoCliente(CONTATOS, null)).toHaveLength(4);
  });
});

describe('🔴 as duas listas são complementares', () => {
  // Esta é A propriedade que quebrou antes. Se alguém mexer numa das funções e esquecer a outra,
  // é aqui que estoura — e não numa tela, semanas depois.
  it.each(['c1', 'c2'])('para o cliente %s, cada contato está em exatamente uma das listas', (clienteId) => {
    const dentro = contatosDoCliente(CONTATOS, clienteId);
    const fora = contatosForaDoCliente(CONTATOS, clienteId);

    expect(dentro.length + fora.length).toBe(CONTATOS.length); // ninguém sumiu
    const idsDentro = new Set(dentro.map((c) => c.id));
    expect(fora.some((c) => idsDentro.has(c.id))).toBe(false); // ninguém em duplicidade
  });
});
