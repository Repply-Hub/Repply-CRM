import { describe, it, expect } from 'vitest';
import { inicioDaAssinatura } from './inicio-da-assinatura';

const INICIO = '2026-05-15T12:00:00.000Z';
const CRIADA = '2026-03-10T12:00:00.000Z';

describe('inicioDaAssinatura', () => {
  it('pagante usa a data de início que o provedor informou', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
    ).toEqual({ rotulo: 'Assinatura iniciada em', em: INICIO });
  });

  it('🔴 pagante sem a data do provedor não mostra nada — nunca inventa', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: null, empresaCriadaEm: CRIADA }),
    ).toBeNull();
  });

  it('cortesia (inclui legacy) usa a data de criação da empresa', () => {
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: null, empresaCriadaEm: CRIADA }),
    ).toEqual({ rotulo: 'Cortesia desde', em: CRIADA });
  });

  it('cortesia ignora data de assinatura, mesmo que exista', () => {
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA })?.em,
    ).toBe(CRIADA);
  });

  it.each(['trial', 'trial_vencido', 'bloqueada', 'nunca_pagou'] as const)(
    '%s não mostra data de início',
    (situacao) => {
      expect(
        inicioDaAssinatura({ situacao, assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
      ).toBeNull();
    },
  );

  it('data ilegível vale como ausente', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: 'abc', empresaCriadaEm: CRIADA }),
    ).toBeNull();
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: null, empresaCriadaEm: 42 }),
    ).toBeNull();
  });

  it('situação desconhecida não mostra nada', () => {
    expect(
      inicioDaAssinatura({ situacao: null, assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
    ).toBeNull();
  });
});
