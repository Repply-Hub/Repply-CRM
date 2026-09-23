import { describe, it, expect } from 'vitest';
import { quemVence, excedeDisjuntor, deveTratarComoRecusa, LIMITE_EXCLUSAO_EM_LOTE } from './conflito';

describe('conflito e proteções da sincronização', () => {
  it('vence a alteração mais recente', () => {
    expect(quemVence('2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')).toBe('google');
    expect(quemVence('2026-10-05T12:00:00Z', '2026-10-05T11:00:00Z')).toBe('repply');
  });

  it('empate favorece o Repply (fonte oficial)', () => {
    expect(quemVence('2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z')).toBe('repply');
  });

  it('disjuntor: aborta quando passaria do limite', () => {
    expect(excedeDisjuntor(LIMITE_EXCLUSAO_EM_LOTE)).toBe(false);
    expect(excedeDisjuntor(LIMITE_EXCLUSAO_EM_LOTE + 1)).toBe(true);
    expect(excedeDisjuntor(0)).toBe(false);
  });

  it('zero linhas é recusa; null NÃO é (nunca !count)', () => {
    expect(deveTratarComoRecusa(0)).toBe(true);
    expect(deveTratarComoRecusa(1)).toBe(false);
    expect(deveTratarComoRecusa(null)).toBe(false);
  });
});
