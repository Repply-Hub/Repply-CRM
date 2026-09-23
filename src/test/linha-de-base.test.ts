import { describe, it, expect } from 'vitest';
// O alvo é um `.mjs` puro, sem tipos, de propósito: ele roda no GitHub Actions com `node`, sem
// passar por build nem por TypeScript. O vitest só varre `src/`, mas importar de fora funciona —
// é assim que a regra tem UMA implementação, testada aqui e usada lá.
import {
  compararComALinhaDeBase,
  contarErrosDeTipo,
  contarProblemasDeLint,
  contarTestesQuePassaram,
} from '../../scripts/comparar-linha-de-base.mjs';

/**
 * O QUE ESTE ARQUIVO PRENDE: a regra que o robô de conferência usa para recusar um envio
 * (item 45 da dívida técnica).
 *
 * 🔴 POR QUE. O projeto convive com saldo herdado: o lint não passa limpo (416 problemas em
 * 23/09/2026) e o TypeScript tem erros antigos (35). Por isso a regra daqui NUNCA foi "passar
 * limpo" — é **o número não subir**. Só que, até hoje, nada conferia isso: a rede de proteção
 * inteira era alguém lembrar de rodar os comandos antes de publicar. E `git push` publica para
 * cliente pagante em minutos.
 *
 * A regra tem dois lados, e o segundo é o que a faz durar:
 *   - subiu  -> RECUSA. É erro novo entrando.
 *   - desceu -> AVISA para baixar a linha de base. Sem isso, um conserto abre folga e a
 *               próxima regressão cabe dentro dela sem ninguém notar.
 *
 * Teste é ao contrário dos outros dois: o que não pode é o número CAIR.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

const BASE = { tsc: 35, lint: 416, testes: 2411 };

describe('compararComALinhaDeBase', () => {
  it('nada mudou: passa', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 35, lint: 416, testes: 2411 });
    expect(r.ok).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it('🔴 erro de tipo a mais: RECUSA', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 36, lint: 416, testes: 2411 });
    expect(r.ok).toBe(false);
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0].metrica).toBe('tsc');
    expect(r.problemas[0].mensagem).toMatch(/35.*36|36.*35/);
  });

  it('🔴 problema de lint a mais: RECUSA', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 35, lint: 417, testes: 2411 });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].metrica).toBe('lint');
  });

  it('🔴 teste a MENOS: RECUSA — apagar teste é o jeito silencioso de ficar verde', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 35, lint: 416, testes: 2410 });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].metrica).toBe('testes');
  });

  it('as três piorando de uma vez aparecem as três, não só a primeira', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 40, lint: 500, testes: 10 });
    expect(r.ok).toBe(false);
    expect(r.problemas.map((p: { metrica: string }) => p.metrica).sort()).toEqual([
      'lint',
      'testes',
      'tsc',
    ]);
  });

  it('🔴 melhorou: PASSA, mas avisa para baixar a linha de base', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 30, lint: 400, testes: 2500 });
    expect(r.ok).toBe(true);
    expect(r.avisos).toHaveLength(3);
    expect(r.avisos.join(' ')).toMatch(/linha de base/i);
  });

  it('o aviso diz o número novo, para dar para copiar e colar', () => {
    const r = compararComALinhaDeBase(BASE, { tsc: 30, lint: 416, testes: 2411 });
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain('30');
  });

  it('🔴 linha de base sem uma das chaves não é tratada como zero', () => {
    // `{}` com `?? 0` viraria "base zero", e aí QUALQUER número seria regressão — o robô
    // recusaria tudo e alguém o desligaria no dia seguinte.
    const r = compararComALinhaDeBase({ tsc: 35 }, { tsc: 35, lint: 416, testes: 2411 });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].mensagem).toMatch(/linha de base/i);
  });
});

/**
 * 🔴 ESTES TRÊS SÃO O CALCANHAR DO ROBÔ, e quase passaram batido.
 *
 * O vitest e o eslint colorem a saída com códigos de escape (`\u001b[32m`). Um contador que
 * procure "Tests 2411 passed" no texto cru NÃO casa, porque os códigos ficam no meio dos
 * números e das palavras. Peguei isso na mão, tentando medir a linha de base com `grep`: o
 * comando devolveu vazio e eu quase anotei o número errado.
 *
 * O estrago seria silencioso e pior que não ter robô: contagem que volta 0 ou NaN faria o robô
 * recusar todo envio (e alguém o desligaria) ou aprovar qualquer regressão.
 */
describe('contadores — a saída vem colorida', () => {
  it('conta os testes mesmo com códigos de cor no meio', () => {
    const cru = ' Tests  2411 passed (2411)';
    const colorido = ' \u001b[2mTests \u001b[22m \u001b[1m\u001b[32m2411 passed\u001b[39m\u001b[22m\u001b[90m (2411)\u001b[39m';
    expect(contarTestesQuePassaram(cru)).toBe(2411);
    expect(contarTestesQuePassaram(colorido)).toBe(2411);
  });

  it('conta os problemas de lint mesmo coloridos', () => {
    expect(contarProblemasDeLint('✖ 416 problems (378 errors, 38 warnings)')).toBe(416);
    expect(contarProblemasDeLint('\u001b[31m\u001b[1m✖ 416 problems\u001b[22m\u001b[39m')).toBe(416);
  });

  it('conta os erros de tipo pelas ocorrências, não por um resumo', () => {
    const saida = [
      'src/a.ts(1,1): error TS2339: Property x does not exist.',
      'src/b.ts(2,2): error TS2578: Unused directive.',
    ].join('\n');
    expect(contarErrosDeTipo(saida)).toBe(2);
  });

  it('🔴 saída vazia não vira zero para os testes — zero seria "nenhum teste" e passaria batido', () => {
    // Para tsc e lint, zero é uma resposta legítima (nada a apontar). Para testes, não:
    // se não deu para ler o número, a comparação tem de reclamar, não aprovar.
    expect(contarTestesQuePassaram('')).toBeNaN();
    expect(contarErrosDeTipo('')).toBe(0);
    expect(contarProblemasDeLint('')).toBe(0);
  });
});
