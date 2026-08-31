import { describe, it, expect } from 'vitest';
import { descreverAlteracao, resumirAlteracao } from './historico-legivel';

/**
 * 🔴 O QUE ESTE ARQUIVO PROTEGE. A decisão do dono do produto libera qualquer pessoa com
 * permissão de editar a reatribuir um negócio — inclusive para si mesma. A garantia que
 * compra essa liberdade é o histórico: "se alguém puxar um negócio para si, fica registrado".
 *
 * A frase que a tela mostrava era `Campos alterados: usuario_id`, com dois UUIDs no detalhe.
 * Está registrado, mas ninguém lê. Estes testes fixam a tradução que torna a garantia real.
 */

const PESSOAS: Record<string, string> = {
  'aaaaaaaa-0000-0000-0000-000000000001': 'Érika Marques',
  'bbbbbbbb-0000-0000-0000-000000000002': 'Gabriel Medeiros',
};
const nomeDe = (id: string) => PESSOAS[id] ?? null;

describe('descreverAlteracao', () => {
  it('🔴 troca de responsável vira nome de gente, não UUID', () => {
    const r = descreverAlteracao(
      { usuario_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      { usuario_id: 'bbbbbbbb-0000-0000-0000-000000000002' },
      nomeDe,
    );
    expect(r).toHaveLength(1);
    expect(r[0].rotulo).toBe('Responsável');
    expect(r[0].de).toBe('Érika Marques');
    expect(r[0].para).toBe('Gabriel Medeiros');
  });

  it('🔴 o responsável vem PRIMEIRO, mesmo no meio de outras mudanças', () => {
    // É a alteração que a auditoria existe para vigiar. Enterrada no meio de dez campos,
    // ninguém a vê.
    const r = descreverAlteracao(
      { valor_total: 1000, status: 'novo_lead', usuario_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      { valor_total: 2000, status: 'negociacao', usuario_id: 'bbbbbbbb-0000-0000-0000-000000000002' },
      nomeDe,
    );
    expect(r[0].campo).toBe('usuario_id');
  });

  it('pessoa que não está na lista vira um pedaço do identificador, não o UUID inteiro', () => {
    // Pessoa excluída, ou lista ainda carregando. Dá para reconhecer sem ocupar a linha toda.
    const r = descreverAlteracao(
      { usuario_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      { usuario_id: 'cccccccc-9999-9999-9999-999999999999' },
      nomeDe,
    );
    expect(r[0].para).toBe('cccccccc…');
    expect(r[0].para).not.toContain('9999-9999');
  });

  it('ignora o ruído de gravação', () => {
    const r = descreverAlteracao(
      { updated_at: '2026-08-01', created_at: '2026-01-01', id: 'x', nome: 'A' },
      { updated_at: '2026-08-31', created_at: '2026-01-01', id: 'x', nome: 'B' },
    );
    expect(r.map((m) => m.campo)).toEqual(['nome']);
  });

  it('campo que sumiu do retrato novo também é alteração', () => {
    const r = descreverAlteracao({ obra_id: 'o1' }, {});
    expect(r).toHaveLength(1);
    expect(r[0].para).toBe('(vazio)');
  });

  it('vazio e nulo contam como a mesma coisa — não inventa alteração', () => {
    expect(descreverAlteracao({ observacoes: null }, {})).toHaveLength(0);
  });

  it('traduz data, número, booleano e nome de campo', () => {
    const r = descreverAlteracao(
      { prazo_resposta: '2026-08-01', valor_total: 1204900, principal: false },
      { prazo_resposta: '2026-09-15T10:00:00Z', valor_total: 2000, principal: true },
    );
    const porCampo = Object.fromEntries(r.map((m) => [m.campo, m]));
    expect(porCampo.prazo_resposta.rotulo).toBe('Data de fechamento');
    expect(porCampo.prazo_resposta.de).toBe('01/08/2026');
    expect(porCampo.prazo_resposta.para).toBe('15/09/2026');
    expect(porCampo.valor_total.de).toBe('1.204.900');
    expect(porCampo.principal.rotulo).toBe('Responsável principal');
    expect(porCampo.principal.para).toBe('sim');
  });

  it('texto longo é cortado — resumo é resumo', () => {
    const r = descreverAlteracao({ observacoes: 'a' }, { observacoes: 'x'.repeat(200) });
    expect(r[0].para.length).toBeLessThan(50);
    expect(r[0].para.endsWith('…')).toBe(true);
  });

  it('campo sem tradução aparece como está — melhor técnico que escondido', () => {
    const r = descreverAlteracao({ campo_estranho: 1 }, { campo_estranho: 2 });
    expect(r[0].rotulo).toBe('campo_estranho');
  });

  it('sem um dos lados não inventa nada', () => {
    expect(descreverAlteracao(null, { a: 1 })).toEqual([]);
    expect(descreverAlteracao({ a: 1 }, null)).toEqual([]);
  });
});

describe('resumirAlteracao', () => {
  it('🔴 a frase diz quem entrou e quem saiu', () => {
    const frase = resumirAlteracao(
      { usuario_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      { usuario_id: 'bbbbbbbb-0000-0000-0000-000000000002' },
      nomeDe,
    );
    expect(frase).toBe('Responsável: Érika Marques → Gabriel Medeiros');
  });

  it('corta a lista longa e diz quantas sobraram', () => {
    const frase = resumirAlteracao(
      { a: 1, b: 1, c: 1, d: 1, e: 1 },
      { a: 2, b: 2, c: 2, d: 2, e: 2 },
    );
    expect(frase).toMatch(/e mais 2$/);
  });

  it('nada mudou devolve nulo, para quem chama decidir o que dizer', () => {
    expect(resumirAlteracao({ a: 1 }, { a: 1 })).toBeNull();
    expect(resumirAlteracao(null, null)).toBeNull();
  });
});
