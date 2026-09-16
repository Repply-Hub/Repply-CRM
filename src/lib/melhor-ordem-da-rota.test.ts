import { describe, it, expect } from 'vitest';
import { avaliarOrdemDaRota, GANHO_MINIMO_S } from './melhor-ordem-da-rota';

describe('avaliarOrdemDaRota', () => {
  it('ordem diferente com ganho relevante: sugere, com o ganho em segundos', () => {
    const r = avaliarOrdemDaRota({ duracaoAtualS: 3600, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 2400 } });
    expect(r).toEqual({ caso: 'ordem_melhor', ganhoS: 1200, ordem: [0, 2, 1] });
  });

  it('🔴 ganho abaixo de 5 minutos vale como já ótima — não se remonta rota por 2 minutos', () => {
    const r = avaliarOrdemDaRota({ duracaoAtualS: 3600, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 3480 } });
    expect(r.caso).toBe('ja_otima');
    expect(r.ordem).toBeNull();
    expect(GANHO_MINIMO_S).toBe(300);
  });

  it('mesma ordem que a atual: já ótima, mesmo que o tempo do serviço seja um pouco menor', () => {
    const r = avaliarOrdemDaRota({ duracaoAtualS: 3600, melhorOrdem: { ordem: [0, 1, 2], duracaoS: 3000 } });
    expect(r.caso).toBe('ja_otima');
  });

  it.each([
    ['sem resposta do serviço', { duracaoAtualS: 3600, melhorOrdem: null }],
    ['sem o tempo da ordem atual', { duracaoAtualS: null, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 2400 } }],
    ['com ordem vazia', { duracaoAtualS: 3600, melhorOrdem: { ordem: [], duracaoS: 2400 } }],
  ])('sem sugestão quando não dá para comparar (%s)', (_caso, entrada) => {
    expect(avaliarOrdemDaRota(entrada as never).caso).toBe('sem_sugestao');
  });

  it('ganho negativo (ordem atual é mais rápida): já ótima', () => {
    const r = avaliarOrdemDaRota({ duracaoAtualS: 2400, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 3000 } });
    expect(r.caso).toBe('ja_otima');
    expect(r.ordem).toBeNull();
    expect(r.ganhoS).toBe(0);
  });

  it('ganho exatamente 300 segundos (limiar mínimo): ordem melhor', () => {
    const r = avaliarOrdemDaRota({ duracaoAtualS: 3600, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 3300 } });
    expect(r.caso).toBe('ordem_melhor');
    expect(r.ganhoS).toBe(300);
    expect(r.ordem).toEqual([0, 2, 1]);
  });

  it('sem números finitos (NaN e Infinity): sem sugestão', () => {
    const r1 = avaliarOrdemDaRota({ duracaoAtualS: NaN, melhorOrdem: { ordem: [0, 2, 1], duracaoS: 2400 } });
    expect(r1.caso).toBe('sem_sugestao');

    const r2 = avaliarOrdemDaRota({ duracaoAtualS: 3600, melhorOrdem: { ordem: [0, 2, 1], duracaoS: Infinity } });
    expect(r2.caso).toBe('sem_sugestao');
  });
});
