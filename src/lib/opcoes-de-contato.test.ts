import { describe, it, expect } from 'vitest';
import {
  opcoesDeContato,
  avisoDaListaDeContatos,
  filtrarOpcoesDeContato,
} from './opcoes-de-contato';

const c = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome_contato: nome,
  ...extra,
});

const DO_CLIENTE = [
  c('a', 'Oswaldo Lima', { cargo: 'Comprador', email: 'oswaldo@macam.com.br' }),
  c('b', 'Lucas Dutra', { telefone: '(84) 99988-7766' }),
];
const TODOS = [
  ...DO_CLIENTE,
  c('x', 'Sofia Andrade', { cargo: 'Eng. residente', empresa: 'Construpav' }),
  c('y', 'Renato Braga', { empresa: 'Ecomax' }),
];

describe('opcoesDeContato', () => {
  it('os do cliente vêm primeiro, sem selo', () => {
    const r = opcoesDeContato(DO_CLIENTE, TODOS);
    expect(r.slice(0, 2).map((o) => o.id)).toEqual(['a', 'b']);
    expect(r[0].selo).toBeUndefined();
  });

  it('🔴 os de outra empresa aparecem, mas MARCADOS com ela', () => {
    // Sem o selo alguém vincula ao canteiro o comprador de outra construtora sem perceber, e o
    // erro só aparece quando essa pessoa recebe ligação sobre uma obra que não é dela.
    const r = opcoesDeContato(DO_CLIENTE, TODOS);
    expect(r.find((o) => o.id === 'x')?.selo).toBe('Construpav');
  });

  it('🔴 contato SEM cliente vinculado continua alcançável', () => {
    // São 428 dos 1.092 contatos da base. Sem isto, nenhum deles pode ser vinculado a obra
    // nenhuma — e não é por não servirem, é por não terem cliente amarrado.
    const semDono = c('z', 'Mestre Josué');
    const r = opcoesDeContato([], [semDono]);
    expect(r).toHaveLength(1);
    expect(r[0].selo).toBeUndefined();
  });

  it('cliente sem contato próprio ainda alcança os outros', () => {
    // É o caso de 32 das 82 obras: sem isto, a lista abria vazia e não havia o que fazer.
    const r = opcoesDeContato([], TODOS);
    expect(r).toHaveLength(4);
  });

  it('ninguém aparece duas vezes', () => {
    const r = opcoesDeContato(DO_CLIENTE, TODOS);
    expect(new Set(r.map((o) => o.id)).size).toBe(r.length);
  });

  it('o detalhe junta cargo, e-mail e telefone — o que houver', () => {
    const r = opcoesDeContato(DO_CLIENTE, TODOS);
    expect(r[0].detalhe).toContain('Comprador');
    expect(r[0].detalhe).toContain('oswaldo@macam.com.br');
    expect(r[1].detalhe).toBe('(84) 99988-7766');
  });

  it('contato sem nada além do nome não inventa detalhe', () => {
    const r = opcoesDeContato([c('n', 'Só o Nome')], []);
    expect(r[0].detalhe).toBeNull();
  });

  it('contato sem nome ganha rótulo, nunca fica em branco', () => {
    const r = opcoesDeContato([{ id: 'v', nome_contato: null }], []);
    expect(r[0].nome).toBe('Contato sem nome');
  });

  it('listas vazias devolvem lista vazia', () => {
    expect(opcoesDeContato([], [])).toEqual([]);
    expect(opcoesDeContato(undefined, undefined)).toEqual([]);
  });
});

describe('avisoDaListaDeContatos', () => {
  it('🔴 distingue "escolha o cliente" de "cliente sem contato"', () => {
    const sem = avisoDaListaDeContatos({ temCliente: false, temAlgum: false });
    const com = avisoDaListaDeContatos({ temCliente: true, temAlgum: false });
    expect(sem).not.toBe(com);
    expect(sem.toLowerCase()).toContain('cliente');
  });

  it('erro de consulta NÃO se disfarça de cadastro vazio', () => {
    const m = avisoDaListaDeContatos({ temCliente: true, temAlgum: false, erro: true });
    expect(m.toLowerCase()).toContain('não foi possível');
  });

  it('quando há contato, não há aviso', () => {
    expect(avisoDaListaDeContatos({ temCliente: true, temAlgum: true })).toBe('');
  });

  it('nenhuma frase volta curta demais para explicar algo', () => {
    for (const caso of [
      { temCliente: false, temAlgum: false },
      { temCliente: true, temAlgum: false },
      { temCliente: true, temAlgum: false, erro: true },
      { temCliente: true, temAlgum: false, carregando: true },
    ]) {
      expect(avisoDaListaDeContatos(caso).length).toBeGreaterThan(10);
    }
  });
});

describe('filtrarOpcoesDeContato', () => {
  const TODAS = opcoesDeContato(DO_CLIENTE, TODOS);

  it('busca vazia devolve tudo', () => {
    expect(filtrarOpcoesDeContato(TODAS, '')).toHaveLength(TODAS.length);
  });

  it('acha pelo nome, pelo cargo e pela empresa do selo', () => {
    expect(filtrarOpcoesDeContato(TODAS, 'sofia')).toHaveLength(1);
    expect(filtrarOpcoesDeContato(TODAS, 'comprador')).toHaveLength(1);
    expect(filtrarOpcoesDeContato(TODAS, 'construpav')).toHaveLength(1);
  });

  it('acha pelo telefone', () => {
    expect(filtrarOpcoesDeContato(TODAS, '99988').length).toBeGreaterThan(0);
  });

  it('não diferencia acento nem caixa', () => {
    // "Josue" tem que achar "Josué", senão quem digita rápido não acha ninguém.
    const r = filtrarOpcoesDeContato(opcoesDeContato([c('j', 'Josué Andrade')], []), 'JOSUE');
    expect(r).toHaveLength(1);
  });

  it('busca sem resultado devolve vazio, não a lista toda', () => {
    expect(filtrarOpcoesDeContato(TODAS, 'zzzznada')).toEqual([]);
  });
});
