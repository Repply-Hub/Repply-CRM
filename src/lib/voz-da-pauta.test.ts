import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vozDaPauta, type ItemParaVoz } from './voz-da-pauta';
import { vozDaPauta as vozDoEmail } from '../../supabase/functions/_shared/voz-da-pauta';

/** A raiz do projeto, a partir DESTE arquivo: o teste não depende da pasta de onde é rodado. */
// Sem `new URL(...)`: no ambiente jsdom dos testes o `URL` global é o do jsdom, e o
// `fileURLToPath` do Node recusa essa instância. `import.meta.url` já chega como texto.
const RAIZ_DO_PROJETO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * A escada de seis degraus que decide o que a tela "Hoje" e o e-mail das 7h dizem.
 *
 * Nome e valor dos negócios aqui são INVENTADOS: este repositório é público desde 26/08/2026,
 * e negócio de cliente de verdade não entra em teste.
 */

// O `Intl` separa "R$" do número com um espaço INQUEBRÁVEL (U+00A0), que impede o valor de
// quebrar de linha no meio. Aqui a frase é conferida como a pessoa a lê — o mesmo recurso de
// `src/lib/moeda.test.ts`. O bloco das duas cópias, no fim, compara o texto cru.
const semNbsp = (s: string | null) => (s === null ? null : s.replace(/\u00A0/g, ' '));

const compromisso = (titulo: string): ItemParaVoz =>
  ({ tipo: 'compromisso', titulo, valor: null, dias_parado: null });
const negocio = (titulo: string, valor: number | null, dias: number): ItemParaVoz =>
  ({ tipo: 'negocio_parado', titulo, valor, dias_parado: dias });

describe('vozDaPauta', () => {
  it('degrau 1 — fila vazia', () => {
    expect(vozDaPauta([], 3).manchete).toBe('Nada parado. Seu dia está seu.');
  });

  it('degrau 2 — só compromissos', () => {
    const v = vozDaPauta([compromisso('Reunião'), compromisso('Visita')], 3);
    expect(v.manchete).toBe('2 compromissos hoje');
    expect(v.apoio).toBeNull();
  });

  it('degrau 2 — um compromisso só, no singular', () => {
    expect(vozDaPauta([compromisso('Reunião')], 3).manchete).toBe('1 compromisso hoje');
  });

  it('degrau 3 — um negócio destoa dos outros', () => {
    const v = vozDaPauta([
      negocio('Obra Exemplo', 180000, 40),
      negocio('Outro', 10000, 8),
    ], 3);
    expect(v.manchete).toBe('Um negócio seu está há 40 dias sem mexer');
    expect(semNbsp(v.apoio)).toBe('R$ 180.000 · Obra Exemplo');
  });

  it('degrau 3 NÃO casa quando o primeiro não é o dobro do segundo', () => {
    const v = vozDaPauta([negocio('A', 100, 12), negocio('B', 50, 10)], 3);
    expect(semNbsp(v.manchete)).toBe('R$ 150 parados em 2 negócios');
  });

  it('degrau 3 NÃO casa com um negócio só — não há segundo colocado', () => {
    const v = vozDaPauta([negocio('A', 100, 90)], 3);
    expect(semNbsp(v.manchete)).toBe('R$ 100 parados em 1 negócio');
  });

  it('degrau 3 NÃO casa abaixo do ajuste da empresa', () => {
    // 4 é o dobro de 2, mas a empresa só considera parado a partir de 10 dias.
    const v = vozDaPauta([negocio('A', 100, 4), negocio('B', 50, 2)], 10);
    expect(semNbsp(v.manchete)).toBe('R$ 150 parados em 2 negócios');
  });

  it('degrau 3 ignora compromissos ao eleger primeiro e segundo', () => {
    const v = vozDaPauta([
      compromisso('Reunião'),
      negocio('Obra Exemplo', 180000, 40),
      negocio('Outro', 10000, 8),
    ], 3);
    expect(v.manchete).toBe('Um negócio seu está há 40 dias sem mexer');
  });

  it('degrau 4 — compromissos e negócios', () => {
    const v = vozDaPauta([
      compromisso('Reunião'),
      negocio('A', 100, 5), negocio('B', 90, 5),
    ], 3);
    expect(v.manchete).toBe('1 compromisso e 2 negócios hoje');
  });

  it('degrau 5 — só negócios, com valor', () => {
    const v = vozDaPauta([negocio('A', 250000, 5), negocio('B', 120500, 5)], 3);
    expect(semNbsp(v.manchete)).toBe('R$ 370.500 parados em 2 negócios');
  });

  it('degrau 6 — só negócios, sem valor somado', () => {
    const v = vozDaPauta([negocio('A', 0, 5), negocio('B', null, 5)], 3);
    expect(v.manchete).toBe('2 negócios parados');
  });

  it('o assunto do e-mail nunca vem vazio', () => {
    for (const itens of [[], [compromisso('R')], [negocio('A', 100, 5)]]) {
      expect(vozDaPauta(itens, 3).assunto.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('as duas cópias dizem a mesma coisa', () => {
  // A função de borda roda em Deno e não importa de `src/`, então a regra existe duas vezes.
  // Se divergirem, a tela e o e-mail contam histórias diferentes do mesmo dia — que é
  // exatamente o tipo de erro que ninguém percebe olhando uma tela só.
  const casos: ItemParaVoz[][] = [
    [],
    [compromisso('Reunião')],
    [negocio('A', 180000, 40), negocio('B', 10000, 8)],
    [compromisso('R'), negocio('A', 100, 5), negocio('B', 90, 5)],
    [negocio('A', 250000, 5), negocio('B', 120500, 5)],
    [negocio('A', 0, 5)],
  ];
  it.each(casos.map((c, i) => [i, c] as const))('caso %i', (_i, itens) => {
    expect(vozDoEmail(itens, 3)).toEqual(vozDaPauta(itens, 3));
  });

  it('e são o mesmo texto — só o fim de linha pode variar', () => {
    // Os seis casos acima visitam seis dias possíveis; uma divergência num caminho que eles não
    // visitam passaria calada. Comparar o texto dos dois arquivos pega qualquer vírgula — e é o
    // que o cabeçalho de `voz-da-pauta.ts` promete.
    // Fim de linha normalizado: no Windows o git troca LF por CRLF sozinho, e uma cópia salva por
    // um editor com outro fim de linha não muda o que a função faz.
    const ler = (caminho: string) =>
      readFileSync(join(RAIZ_DO_PROJETO, caminho), 'utf8').split(String.fromCharCode(13)).join('');
    expect(ler('supabase/functions/_shared/voz-da-pauta.ts')).toBe(ler('src/lib/voz-da-pauta.ts'));
  });
});

/**
 * A concordância no singular, que a primeira versão errava em dois degraus. As frases são as
 * aprovadas pelo dono do produto; o que muda é só o número concordar com o substantivo quando ele
 * é 1. "1 negócio parados" chega na caixa de entrada de alguém toda manhã em que a fila tiver um
 * único negócio sem valor — e texto errado todo dia corrói a confiança no resto da tela.
 */
describe('concordância no singular', () => {
  it('degrau 6 com UM negócio: "1 negócio parado", nunca "1 negócio parados"', () => {
    const v = vozDaPauta([negocio('A', null, 5)], 3);
    expect(v.manchete).toBe('1 negócio parado');
    expect(v.assunto).toBe('1 negócio parado hoje');
  });

  it('degrau 6 com dois continua no plural', () => {
    expect(vozDaPauta([negocio('A', null, 5), negocio('B', 0, 5)], 3).manchete).toBe('2 negócios parados');
  });

  it('degrau 3 com 1 dia: "há 1 dia", nunca "há 1 dias"', () => {
    // Só acontece se a empresa ajustar `pauta_dias_parado` para 1 — a tela aceita de 1 a 365.
    const v = vozDaPauta([negocio('Obra Exemplo', 100, 1), negocio('Outro', 50, 0)], 1);
    expect(v.manchete).toBe('Um negócio seu está há 1 dia sem mexer');
    expect(v.assunto).toBe('Um negócio seu está há 1 dia sem mexer');
  });
});

/**
 * O que a revisão de 11/09/2026 achou SEM teste: cinco mutações plausíveis da função passavam com a
 * suíte inteira verde. Cada caso abaixo derruba uma delas.
 */
describe('o que a revisão achou sem teste', () => {
  it('degrau 3 na ordem em que a lista chega de verdade: do maior valor para o menor', () => {
    // A fila vem ordenada por VALOR, então o negócio esquecido raramente é o primeiro da lista.
    // Eleger "o primeiro da lista" daria os 40 dias certos com o nome e o valor do negócio errado.
    const v = vozDaPauta([negocio('Grande', 500000, 5), negocio('Esquecido', 1000, 40)], 3);
    expect(v.manchete).toBe('Um negócio seu está há 40 dias sem mexer');
    expect(semNbsp(v.apoio)).toBe('R$ 1.000 · Esquecido');
  });

  it('degrau 3 no empate exato: o dobro já casa ("pelo menos o dobro")', () => {
    expect(vozDaPauta([negocio('A', 100, 6), negocio('B', 50, 3)], 3).manchete)
      .toBe('Um negócio seu está há 6 dias sem mexer');
  });

  it('degrau 3 exatamente no ajuste da empresa: "a partir de", como a própria fila', () => {
    expect(vozDaPauta([negocio('A', 100, 3), negocio('B', 50, 1)], 3).manchete)
      .toBe('Um negócio seu está há 3 dias sem mexer');
  });

  it('degrau 3 com o negócio sem valor: embaixo vai só o nome, nunca "R$ 0 · nome"', () => {
    expect(vozDaPauta([negocio('Sem Valor', 0, 40), negocio('B', 100, 8)], 3).apoio).toBe('Sem Valor');
  });

  it('o assunto do degrau 1 é o aprovado', () => {
    expect(vozDaPauta([], 3).assunto).toBe('Seu dia está livre');
  });

  it('o assunto do degrau 5 é o aprovado, sem centavos', () => {
    const v = vozDaPauta([negocio('A', 250000, 5), negocio('B', 120500, 5)], 3);
    expect(semNbsp(v.assunto)).toBe('R$ 370.500 esperando você hoje');
  });

  it('dinheiro sem centavos, como o e-mail: numa manchete os centavos só atrapalham', () => {
    const v = vozDaPauta([negocio('A', 1234.56, 5), negocio('B', 0.4, 5)], 3);
    expect(semNbsp(v.manchete)).toBe('R$ 1.235 parados em 2 negócios');
  });
});

describe('o ajuste da empresa ausente ou inválido vale 3, como no banco', () => {
  // `pauta_do_dia_de` troca ajuste ausente por 3, e a tela de Automação aceita de 1 a 365. Sem esta
  // guarda, ajuste 0 ou nulo faria o degrau 3 dizer "há 0 dias sem mexer" sobre negócio mexido hoje.
  const mexidosHoje = [negocio('A', 100, 0), negocio('B', 50, 0)];
  it.each([
    ['zero', 0],
    ['nulo', null as unknown as number],
    ['não-número', Number.NaN],
    ['negativo', -5],
  ])('ajuste %s: nunca "há 0 dias"', (_nome, ajuste) => {
    expect(semNbsp(vozDaPauta(mexidosHoje, ajuste).manchete)).toBe('R$ 150 parados em 2 negócios');
  });
});
