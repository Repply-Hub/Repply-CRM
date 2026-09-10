import { describe, it, expect } from 'vitest';
import {
  fraseDaTentativa,
  nomeDoProvedor,
  type TentativaDeConexao,
} from '@/hooks/use-tentativas-de-conexao';

const base: TentativaDeConexao = {
  provedor: 'imap',
  criadoEm: '2026-09-09T12:31:43Z',
  resultado: null,
  erroCodigo: null,
  erroDetalhe: null,
};

describe('nomeDoProvedor', () => {
  it('traduz os três que a tela oferece', () => {
    expect(nomeDoProvedor('google')).toBe('Gmail / Google Workspace');
    expect(nomeDoProvedor('microsoft')).toBe('Outlook / Microsoft 365');
    expect(nomeDoProvedor('imap')).toBe('servidor próprio (IMAP)');
  });

  it('provedor desconhecido aparece como veio, em vez de sumir', () => {
    expect(nomeDoProvedor('yahoo')).toBe('yahoo');
  });
});

describe('fraseDaTentativa', () => {
  it('🔴 tentativa que não voltou é dita, não escondida', () => {
    // É o caso da JHS: quatro tentativas, nenhuma voltou, e a tela mostrava o
    // mesmo "conecte sua caixa" como se nada tivesse acontecido.
    expect(fraseDaTentativa(base)).toBe(
      'Você começou a conectar servidor próprio (IMAP) e não terminou — a tela do provedor não devolveu resposta.',
    );
  });

  it('desistência é dita como desistência', () => {
    expect(fraseDaTentativa({ ...base, resultado: 'cancelada' })).toBe(
      'Você começou a conectar servidor próprio (IMAP) e cancelou na tela do provedor.',
    );
  });

  it('🔴 recusa do provedor NÃO é chamada de cancelamento', () => {
    // O defeito original: qualquer erro virava "Conexão cancelada".
    const frase = fraseDaTentativa({ ...base, resultado: 'recusada', erroCodigo: 'invalid_authentication' });
    expect(frase).toBe('O provedor recusou a conexão com servidor próprio (IMAP).');
    expect(frase).not.toContain('cancel');
  });

  it('retorno incompleto tem frase própria', () => {
    expect(fraseDaTentativa({ ...base, resultado: 'erro' })).toBe(
      'A conexão com servidor próprio (IMAP) voltou incompleta do provedor.',
    );
  });

  it('cada provedor aparece com o nome dele na frase', () => {
    expect(fraseDaTentativa({ ...base, provedor: 'google', resultado: 'recusada' }))
      .toContain('Gmail / Google Workspace');
  });
});
