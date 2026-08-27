import { describe, it, expect } from 'vitest';
import { rotuloDaEdicao, compararPorEdicao, tamanhoLegivel } from './fabricante-arquivos';

describe('rotuloDaEdicao', () => {
  it('mês e ano viram "set/2026"', () => {
    expect(rotuloDaEdicao(2026, 9)).toBe('set/2026');
  });

  it('sem mês, mostra só o ano — é a fábrica que faz catálogo anual', () => {
    expect(rotuloDaEdicao(2026, null)).toBe('2026');
    expect(rotuloDaEdicao(2026, undefined)).toBe('2026');
  });

  it('os doze meses têm rótulo próprio', () => {
    const vistos = new Set(Array.from({ length: 12 }, (_, i) => rotuloDaEdicao(2026, i + 1)));
    expect(vistos.size).toBe(12);
  });

  it('mês fora da faixa não inventa rótulo — cai no ano', () => {
    // O banco tem `check (edicao_mes between 1 and 12)`, mas a tela não é a única porta:
    // linha mexida à mão no painel do Supabase não pode virar "undefined/2026" no cartão.
    expect(rotuloDaEdicao(2026, 0)).toBe('2026');
    expect(rotuloDaEdicao(2026, 13)).toBe('2026');
  });
});

describe('compararPorEdicao', () => {
  const a = (ano: number, mes: number | null) => ({ edicao_ano: ano, edicao_mes: mes });

  it('ano mais novo vem primeiro', () => {
    expect(compararPorEdicao(a(2025, 1), a(2026, 1))).toBeGreaterThan(0);
  });

  it('no mesmo ano, mês mais novo vem primeiro', () => {
    expect(compararPorEdicao(a(2026, 3), a(2026, 9))).toBeGreaterThan(0);
  });

  it('🔴 o catálogo do ANO perde para a edição mensal do mesmo ano', () => {
    // "set/2026" é mais atual que "2026": o do ano se comporta como se fosse de janeiro.
    // Sem isso os dois empatam, a ordem fica à mercê da ordem de chegada, e o representante
    // abre a fábrica sem saber qual é a edição vigente.
    expect(compararPorEdicao(a(2026, null), a(2026, 9))).toBeGreaterThan(0);
  });

  it('ordena a lista inteira, da mais nova para a mais velha', () => {
    const lista = [a(2026, null), a(2025, 12), a(2026, 9), a(2026, 3)];
    expect([...lista].sort(compararPorEdicao)).toEqual([
      a(2026, 9),
      a(2026, 3),
      a(2026, null),
      a(2025, 12),
    ]);
  });

  it('empate devolve zero, para o desempate ficar por conta de quem chamou', () => {
    expect(compararPorEdicao(a(2026, 9), a(2026, 9))).toBe(0);
  });
});

describe('tamanhoLegivel', () => {
  it('abaixo de um mega, mostra em KB', () => {
    expect(tamanhoLegivel(348_160)).toBe('340 KB');
  });

  it('acima de um mega, mostra em MB com uma casa', () => {
    expect(tamanhoLegivel(15 * 1024 * 1024)).toBe('15,0 MB');
  });

  it('usa vírgula decimal — é PT-BR, não formato americano', () => {
    expect(tamanhoLegivel(1_572_864)).toBe('1,5 MB');
  });

  it('arquivo vazio ou tamanho inválido não vira "NaN" na tela', () => {
    expect(tamanhoLegivel(0)).toBe('0 KB');
    expect(tamanhoLegivel(-1)).toBe('0 KB');
    expect(tamanhoLegivel(Number.NaN)).toBe('0 KB');
  });

  it('o teto de 50 MB aparece redondo', () => {
    expect(tamanhoLegivel(50 * 1024 * 1024)).toBe('50,0 MB');
  });
});
