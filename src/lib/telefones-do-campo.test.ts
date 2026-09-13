import { describe, it, expect } from 'vitest';
import {
  separarTelefones,
  juntarTelefones,
  ehTelefoneLivre,
  limitarTelefoneDigitado,
  formatarTelefoneGuardado,
} from './telefones-do-campo';

/**
 * Os formatos de campo com VÁRIOS números que existem na base (medido em 11/09/2026: 148
 * cadastros, sempre separados por vírgula) — com dígitos inventados (CLAUDE.md §6.9).
 */
const FORMATOS_REAIS = [
  '5584999998888, 558432221111',
  '558432221111, 84999998888',
  '5584999998888, 84999997777, 558432221111',
  '(84) 3222-1111, (84) 99999-8888',
];

/** O número nacional de cada pedaço — o que NÃO pode mudar na ida e volta. */
const nacionais = (campo: string) =>
  separarTelefones(campo).map((p) => {
    const d = p.replace(/\D/g, '');
    return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  });

describe('separarTelefones / juntarTelefones — ida e volta sem perder número', () => {
  it.each(FORMATOS_REAIS)('%s abre em campos separados e volta igual', (bruto) => {
    const partes = separarTelefones(bruto);
    expect(partes).toHaveLength(bruto.split(',').length);
    expect(juntarTelefones(partes)).toBe(bruto);
  });

  it.each(FORMATOS_REAIS)('%s, formatado campo a campo, mantém cada número', (bruto) => {
    const formatado = juntarTelefones(separarTelefones(bruto).map(formatarTelefoneGuardado));
    expect(nacionais(formatado)).toEqual(nacionais(bruto));
  });

  it('separa também por ponto e vírgula e barra — o mesmo separador do reconhecimento do WhatsApp', () => {
    expect(separarTelefones('84999998888; 8432221111 / 84999997777')).toEqual([
      '84999998888',
      '8432221111',
      '84999997777',
    ]);
  });

  it('NÃO parte no hífen — o identificador de grupo antigo do WhatsApp tem hífen', () => {
    expect(separarTelefones('558499999888-1587654321')).toEqual(['558499999888-1587654321']);
  });

  it('campo vazio é lista vazia, e lista de vazios grava vazio', () => {
    expect(separarTelefones('')).toEqual([]);
    expect(separarTelefones(null)).toEqual([]);
    expect(juntarTelefones(['', '  '])).toBe('');
  });
});

describe('formatarTelefoneGuardado — o que o campo mostra ao abrir e ao sair', () => {
  it('celular de 11 dígitos, e com o 55 grudado, vira (DD) NNNNN-NNNN', () => {
    expect(formatarTelefoneGuardado('84999998888')).toBe('(84) 99999-8888');
    expect(formatarTelefoneGuardado('5584999998888')).toBe('(84) 99999-8888');
    expect(formatarTelefoneGuardado('+55 84 99999-8888')).toBe('(84) 99999-8888');
  });

  it('fixo de 10 dígitos, e com o 55 grudado, vira (DD) NNNN-NNNN — sem nono dígito', () => {
    expect(formatarTelefoneGuardado('8432221111')).toBe('(84) 3222-1111');
    expect(formatarTelefoneGuardado('558432221111')).toBe('(84) 3222-1111');
  });

  it.each([
    '+1 415 555 0123',
    '120363012345678901@g.us',
    '558499999888-1587654321',
    '0800 123 4567',
    '(84) 3222-1111 ramal 20',
    '1234',
    '849999',
  ])('%s passa intacto — não é telefone brasileiro completo', (parte) => {
    expect(formatarTelefoneGuardado(parte)).toBe(parte);
  });
});

describe('ehTelefoneLivre — o que a regra brasileira não pode tocar', () => {
  it.each(['+1 415 555 0123', '120363012345678901@g.us', '558499999888-1587654321', '0800 123 4567', 'ramal 20'])(
    '%s é livre',
    (parte) => expect(ehTelefoneLivre(parte)).toBe(true),
  );
  it.each(['84999998888', '(84) 3222-1111', '+55 84 99999-8888', ''])('%s não é livre', (parte) =>
    expect(ehTelefoneLivre(parte)).toBe(false),
  );
});

describe('limitarTelefoneDigitado — enquanto a pessoa digita', () => {
  it('aceita o que se digita como está — formatar é ao sair (CLAUDE.md §7.10)', () => {
    expect(limitarTelefoneDigitado('8499999', '849999')).toBe('8499999');
    expect(limitarTelefoneDigitado('(84) 99999-888', '(84) 99999-88')).toBe('(84) 99999-888');
  });

  it('🔴 o 12º dígito não entra — o campo é de UM número', () => {
    expect(limitarTelefoneDigitado('849999988881', '84999998888')).toBe('84999998888');
    expect(limitarTelefoneDigitado('(84) 99999-88881', '(84) 99999-8888')).toBe('(84) 99999-8888');
  });

  it('número colado com o 55 do país entra inteiro — o 55 não conta como dígito do número', () => {
    expect(limitarTelefoneDigitado('+55 84 99999-8888', '')).toBe('+55 84 99999-8888');
    expect(limitarTelefoneDigitado('5584999998888', '')).toBe('5584999998888');
  });

  it.each(['+1 415 555 0123', '120363012345678901@g.us', '0800 123 4567', 'ramal 20'])(
    '%s passa sem limite',
    (texto) => expect(limitarTelefoneDigitado(texto, '')).toBe(texto),
  );

  it('o que já estava fora do formato não é cortado quando a pessoa edita', () => {
    expect(limitarTelefoneDigitado('84 3222 1111 2010', '84 3222 1111 201')).toBe('84 3222 1111 2010');
  });

  it('apagar tudo deixa vazio', () => {
    expect(limitarTelefoneDigitado('', '(8')).toBe('');
  });

  it('🔴 celular de DDD 55 digitado: o 12º dígito não entra', () => {
    expect(limitarTelefoneDigitado('559912345678', '55991234567')).toBe('55991234567');
  });

  it('fixo de DDD 55 chegando a 11 dígitos continua podendo', () => {
    expect(limitarTelefoneDigitado('55322111111', '5532211111')).toBe('55322111111');
  });

  it('🔴 fixo de DDD 55 digitado também barra no 12º dígito', () => {
    expect(limitarTelefoneDigitado('553221111112', '55322111111')).toBe('55322111111');
  });

  it('quem digita com "+" pode escrever o código do país tecla a tecla', () => {
    expect(limitarTelefoneDigitado('+55 84 99999-8888', '+55 84 99999-888')).toBe('+55 84 99999-8888');
  });
});
