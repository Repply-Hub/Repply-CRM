import { describe, it, expect } from 'vitest';
import { avaliarOrdemDaRota, GANHO_MINIMO_S, pontosDaRotaEmOrdem, rotaAceitaSugestaoDeOrdem } from './melhor-ordem-da-rota';

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

describe('pontosDaRotaEmOrdem', () => {
  // Coordenadas inventadas (Natal/RN) — nunca dado real (CLAUDE.md §6.9). Propositalmente
  // fora de ordem alfabética/numérica, para provar que a função segue a ordem das PARADAS.
  const OBRAS = [
    { id: 'obra-c', latitude: -5.75, longitude: -35.25 },
    { id: 'obra-a', latitude: -5.79, longitude: -35.21 },
    { id: 'obra-b', latitude: -5.81, longitude: -35.23 },
  ];

  it('devolve um ponto por parada, na ordem das PARADAS — não na ordem da lista de obras', () => {
    const paradas = [{ obraId: 'obra-a' }, { obraId: 'obra-b' }, { obraId: 'obra-c' }];
    expect(pontosDaRotaEmOrdem(paradas, OBRAS)).toEqual([
      { lat: -5.79, lng: -35.21 },
      { lat: -5.81, lng: -35.23 },
      { lat: -5.75, lng: -35.25 },
    ]);
  });

  it('🔴 uma parada sem localização derruba a ROTA INTEIRA — filtrar deslocaria os índices que `aplicarOrdemMantendoHorarios` espera', () => {
    const comUmaObraSemLocal = [
      OBRAS[0],
      OBRAS[1],
      { id: 'obra-b', latitude: null, longitude: null },
    ];
    const paradas = [{ obraId: 'obra-a' }, { obraId: 'obra-b' }, { obraId: 'obra-c' }];
    expect(pontosDaRotaEmOrdem(paradas, comUmaObraSemLocal)).toBeNull();
  });

  it('parada cuja obra não está na lista de obras: null', () => {
    const paradas = [{ obraId: 'obra-a' }, { obraId: 'obra-fantasma' }];
    expect(pontosDaRotaEmOrdem(paradas, OBRAS)).toBeNull();
  });

  it('sem paradas: lista vazia — não é erro, `urlDaMelhorOrdem` já devolve vazio sozinho', () => {
    expect(pontosDaRotaEmOrdem([], OBRAS)).toEqual([]);
  });
});

describe('rotaAceitaSugestaoDeOrdem', () => {
  it('sem parada realizada: aceita sugestão', () => {
    const paradas = [
      { realizada: false },
      { realizada: false },
      { realizada: false },
    ];
    expect(rotaAceitaSugestaoDeOrdem(paradas)).toBe(true);
  });

  it('uma parada realizada entre outras: rejeita sugestão — rota é história', () => {
    const paradas = [
      { realizada: false },
      { realizada: true },
      { realizada: false },
    ];
    expect(rotaAceitaSugestaoDeOrdem(paradas)).toBe(false);
  });

  it('todas as paradas realizadas: rejeita sugestão', () => {
    const paradas = [
      { realizada: true },
      { realizada: true },
      { realizada: true },
    ];
    expect(rotaAceitaSugestaoDeOrdem(paradas)).toBe(false);
  });

  it('lista vazia: aceita sugestão — não há nada a rejeitar', () => {
    expect(rotaAceitaSugestaoDeOrdem([])).toBe(true);
  });

  it('parada com `realizada` ausente: trata como não realizada', () => {
    const paradas = [{ realizada: undefined }, { realizada: false }];
    expect(rotaAceitaSugestaoDeOrdem(paradas)).toBe(true);
  });

  it('parada com `realizada` null: trata como não realizada', () => {
    const paradas = [{ realizada: null }, { realizada: false }];
    expect(rotaAceitaSugestaoDeOrdem(paradas)).toBe(true);
  });
});
