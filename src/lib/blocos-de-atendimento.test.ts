import { describe, it, expect } from 'vitest';
import { blocosDeAtendimento, blocosNaJanela } from './blocos-de-atendimento';

const msg = (id: string, created_at: string, conteudo = 'oi') => ({
  id, created_at, conteudo, is_nota_interna: false,
});
const nota = (id: string, created_at: string, conteudo: string) => ({
  id, created_at, conteudo, is_nota_interna: true,
});

describe('blocosDeAtendimento', () => {
  it('conversa sem fechamento nenhum é um bloco só', () => {
    // É o histórico anterior a 20/07/2026, quando fechar conversa passou a
    // existir: degrada para o comportamento antigo, sem código de transição.
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      msg('m2', '2026-08-05T10:00:00Z'),
      msg('m3', '2026-08-20T10:00:00Z'),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].primeiraMensagemId).toBe('m1');
    expect(b[0].mensagens).toBe(3);
    expect(b[0].fechado).toBe(false);
  });

  it('o fechamento corta, e a mensagem seguinte abre o próximo', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      msg('m2', '2026-08-01T11:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
      msg('m3', '2026-08-10T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[0].primeiraMensagemId).toBe('m1');
    expect(b[0].mensagens).toBe(2);
    expect(b[0].fechado).toBe(true);
    expect(b[0].fimEm).toBe('2026-08-01T12:00:00Z');
    expect(b[1].primeiraMensagemId).toBe('m3');
    expect(b[1].fechado).toBe(false);
  });

  it('reconhece o fechamento que também remove responsáveis', () => {
    // A forma mais comum na MD: 1.181 + 1.108 + 475 ocorrências.
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z',
        'Pricila Azevedo fechou a conversa e removeu Pricila Azevedo dos responsáveis'),
      msg('m2', '2026-08-02T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
  });

  it('guarda quem assumiu o atendimento', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Érika Marques assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
    ]);
    expect(b[0].atendentes).toEqual(['Érika Marques']);
  });

  it('não repete o mesmo atendente', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Érika Marques assumiu esta conversa'),
      nota('n1', '2026-08-01T09:30:00Z', 'Érika Marques assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b[0].atendentes).toEqual(['Érika Marques']);
  });

  it('dois fechamentos seguidos, sem mensagem no meio, não criam bloco vazio', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
      nota('n2', '2026-08-01T13:00:00Z', 'Daniel Nóbrega fechou a conversa'),
    ]);
    expect(b).toHaveLength(1);
  });

  it('nota nunca conta como mensagem', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Érika Marques assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b[0].mensagens).toBe(1);
    expect(b[0].primeiraMensagemId).toBe('m1');
  });

  it('as outras notas não cortam nem viram atendente', () => {
    // "direcionou", "adicionou", "saiu" — todas existem no histórico da MD.
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T10:30:00Z', 'Pricila Azevedo direcionou esta conversa para Daniel Nóbrega'),
      nota('n2', '2026-08-01T10:40:00Z', 'Pricila Azevedo adicionou Érika Marques como responsável'),
      nota('n3', '2026-08-01T10:50:00Z', 'Érika Marques saiu dos responsáveis desta conversa'),
      msg('m2', '2026-08-01T11:00:00Z'),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].mensagens).toBe(2);
    expect(b[0].atendentes).toEqual([]);
  });

  it('a nota de reabertura não corta nem vira atendente', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
      nota('n2', '2026-08-02T09:00:00Z', 'Érika Marques reabriu a conversa'),
      msg('m2', '2026-08-02T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[1].primeiraMensagemId).toBe('m2');
    expect(b[1].atendentes).toEqual([]);
  });

  it('ordena mesmo se vier fora de ordem', () => {
    // O realtime insere no começo da lista; o chamador pode entregar assim.
    const b = blocosDeAtendimento([
      msg('m2', '2026-08-10T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[0].primeiraMensagemId).toBe('m1');
  });

  it('lista vazia devolve lista vazia', () => {
    expect(blocosDeAtendimento([])).toEqual([]);
  });

  it('conversa só com notas não vira bloco nenhum', () => {
    expect(blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Érika Marques assumiu esta conversa'),
      nota('n1', '2026-08-01T12:00:00Z', 'Érika Marques fechou a conversa'),
    ])).toEqual([]);
  });
});

describe('blocosNaJanela', () => {
  const blocos = blocosDeAtendimento([
    msg('m1', '2026-05-01T10:00:00Z'),
    nota('n1', '2026-05-02T10:00:00Z', 'Érika Marques fechou a conversa'),
    msg('m2', '2026-07-01T10:00:00Z'),
    nota('n2', '2026-07-02T10:00:00Z', 'Érika Marques fechou a conversa'),
    msg('m3', '2026-09-01T10:00:00Z'),
  ]);

  it('entra o bloco cujo INÍCIO cai na janela', () => {
    const r = blocosNaJanela(blocos, '2026-06-01T00:00:00Z', '2026-08-01T00:00:00Z');
    expect(r.map((b) => b.primeiraMensagemId)).toEqual(['m2']);
  });

  it('🔴 atendimento que começou ANTES do negócio não é dele', () => {
    // Mesmo que tenha se arrastado para dentro da janela.
    const r = blocosNaJanela(blocos, '2026-05-02T00:00:00Z', '2026-06-01T00:00:00Z');
    expect(r).toEqual([]);
  });

  it('janela que cobre tudo devolve tudo', () => {
    const r = blocosNaJanela(blocos, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
    expect(r).toHaveLength(3);
  });

  it('janela sem nada devolve vazio', () => {
    expect(blocosNaJanela(blocos, '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')).toEqual([]);
  });
});
