# Rota de visita: melhor ordem e análise — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rota avisa quando existe uma ordem mais rápida (e oferece trocar, sem mexer nos horários), e a visita concluída troca a pergunta genérica por quatro respostas rápidas — com o próximo passo virando tarefa e a análise entrando na mensagem do WhatsApp.

**Architecture:** Duas partes independentes do mesmo módulo. **A** é cálculo: o mesmo OSRM de hoje, no serviço `trip`, resolve a melhor sequência; funções puras leem a resposta, decidem se vale sugerir e aplicam a ordem preservando a grade de horários que a pessoa montou. **B** é registro: cinco colunas novas na visita (ao lado das duas que já existem), um componente único de perguntas usado nos dois lugares em que se marca "realizada", o próximo passo virando tarefa, e a mensagem da rota passando a carregar a análise.

**Tech Stack:** React 18 + TypeScript (frouxo) + Vite, TanStack Query, shadcn/Radix, Supabase (migration nova), Vitest + Testing Library (jsdom, **sem** `user-event` — use `fireEvent`).

**Desenho aprovado:** `docs/superpowers/specs/2026-09-12-rota-de-visita-ordem-e-analise-design.md`. Leia antes da primeira tarefa.

## Global Constraints

- Tudo em **PT-BR**: tela, comentário, nome de teste, mensagem de commit.
- 🔴 **Dado real não entra em teste nem comentário** (CLAUDE.md §6.9). Use "Obra Exemplo", "Empresa Exemplo Ltda", coordenadas inventadas em Natal (-5.79, -35.21) e identificadores como `obra-1`.
- 🔴 **Serviço de rotas fora do ar, lento ou resposta estranha = NENHUMA sugestão.** Nunca invente ordem por linha reta.
- 🔴 **Nenhuma pergunta da visita é obrigatória**, e nenhuma delas pode impedir a visita de ser gravada.
- 🔴 **A migration é escrita mas NÃO aplicada** por quem executa. Aplicar em produção é gesto do Lucas (`escrita-em-producao-passa-pela-mao-do-lucas`). Escreva a migration, atualize os tipos à mão (CLAUDE.md §6.8) e **avise** que ela está pendente.
- **Nunca edite migration existente** — só acrescente arquivo novo (CLAUDE.md §6.3).
- Fuso: `format` do date-fns (local) para data na tela e na mensagem; **nunca** `toISOString().slice(0,10)` (CLAUDE.md §7.12).
- Erro de gravação na tela: `mensagemDeErro`. Modal: `<ConteudoDialogo>` e companhia.
- Tipos: `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`**.
- 🔴 **Critério de tipos e lint é por arquivo.** Guarde a linha de base de cada arquivo tocado antes da Tarefa 1 e compare ao fim de cada tarefa.
- Git — ⚠️ **outra sessão mexeu nesta mesma área em 12/09/2026** (commit `49588ea0`, em `Obras.tsx` e `NovaRotaVisitaDialog.tsx`):
  - rode `git fetch origin && git log --oneline HEAD..origin/main` e `git log --oneline -5` **antes de começar**; se houver commit novo nesses arquivos, leia-o antes de editar;
  - `git status --short` num comando **separado** antes de cada commit;
  - `git commit -F <arquivo-da-mensagem> --only -- <caminhos>`, nunca `git add -A`;
  - **nunca** `git push`;
  - toda mensagem termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **Nenhuma gravação em produção, e NENHUMA mensagem enviada para ninguém.** O ensaio para antes de salvar e antes de enviar.

## Decisões técnicas deste plano (tomadas ao escrever, com o porquê)

1. **O cálculo da melhor ordem usa o serviço `trip` do próprio OSRM**, com `source=first` e `roundtrip=false`. Uma requisição resolve a sequência; fazer a conta aqui exigiria a matriz de tempos (`/table`) e um segundo algoritmo para manter.
2. **A leitura da resposta é defensiva e separada da decisão.** `osrm.ts` só traduz a resposta; quem decide se vale sugerir é uma função pura própria, que se testa sem rede.
3. **Ganho abaixo de 5 minutos é tratado como "já está ótima".** Sugerir remonta a rota inteira por dois minutos — conselho que atrapalha mais do que ajuda.
4. **Aplicar a sugestão reaproveita a grade de horários**, exatamente como arrastar uma parada faz hoje (`moverParadaMantendoHorarios`). Nenhum horário novo é inventado.
5. **As cinco respostas ficam em colunas de `eventos`**, ao lado de `visita_realizada` e `visita_observacao`. É o padrão que já existe para visita, e a gravação por `grupo_id` continua alcançando as cópias de todos os participantes.
6. **A tarefa do próximo passo só nasce com data.** Tarefa sem prazo não cobra ninguém.
7. **A montagem do texto da análise é função pura**, usada pela mensagem do WhatsApp — é como se testa o formato sem rede nem tela.

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/osrm.ts` + teste (mexe) | `urlDaMelhorOrdem` e `lerRespostaDaMelhorOrdem` (serviço `trip`) |
| `src/lib/melhor-ordem-da-rota.ts` + teste (cria) | decide: já ótima, ordem melhor (com ganho) ou sem sugestão |
| `src/lib/ordem-das-paradas.ts` + teste (mexe) | `aplicarOrdemMantendoHorarios` |
| `src/hooks/use-melhor-ordem.ts` (cria) | a ida à rede, com as mesmas guardas de `useRotaOsrm` |
| `src/components/obras/NovaRotaVisitaDialog.tsx` (mexe) | o aviso, o botão e as perguntas da visita |
| `supabase/migrations/<timestamp>_analise_da_visita.sql` (cria) | as 5 colunas em `eventos` |
| `src/integrations/supabase/types.ts` (mexe) | os tipos das colunas novas, à mão |
| `src/lib/analise-da-visita.ts` + teste (cria) | fases, resumo em texto e a tarefa do próximo passo |
| `src/components/obras/PerguntasDaVisita.tsx` (cria) | as quatro perguntas, usadas nos dois lugares |
| `src/hooks/use-obra-visitas.ts` (mexe) | gravar a análise junto com "realizada" |
| `src/components/obras/VisitasObrasPainel.tsx` (mexe) | perguntas no painel e análise na mensagem |
| `src/lib/rota-no-whatsapp.ts` + teste (mexe) | a análise embaixo de cada obra visitada |
| `src/components/obras/HistoricoVisitasObra.tsx` (mexe) | "última fase conhecida" na ficha da obra |

---

### Task 1: O serviço `trip` — URL e leitura

**Files:**
- Modify: `src/lib/osrm.ts`
- Test: `src/lib/osrm.test.ts` (se não existir, crie)

**Interfaces:**
- Produces:
  ```ts
  export interface MelhorOrdemDoServico { ordem: number[]; duracaoS: number }
  export function urlDaMelhorOrdem(pontos: PontoNoMapa[]): string;
  export function lerRespostaDaMelhorOrdem(json: unknown, totalDePontos: number): MelhorOrdemDoServico | null;
  ```

- [ ] **Step 1: Write the failing test** — acrescente ao teste do `osrm`:

```ts
import { urlDaMelhorOrdem, lerRespostaDaMelhorOrdem } from './osrm';

const TRES_OBRAS = [
  { lat: -5.79, lng: -35.21 },
  { lat: -5.81, lng: -35.23 },
  { lat: -5.75, lng: -35.25 },
];

describe('urlDaMelhorOrdem', () => {
  it('pede a melhor sequência saindo da primeira parada e sem voltar para ela', () => {
    const url = urlDaMelhorOrdem(TRES_OBRAS);
    expect(url).toContain('/trip/v1/driving/');
    expect(url).toContain('source=first');
    expect(url).toContain('roundtrip=false');
    // 🔴 lng antes de lat — a ordem do OSRM, o contrário do Leaflet.
    expect(url).toContain('-35.21,-5.79;-35.23,-5.81;-35.25,-5.75');
  });

  it('não pede nada com menos de 3 paradas — com 2 não existe ordem melhor', () => {
    expect(urlDaMelhorOrdem(TRES_OBRAS.slice(0, 2))).toBe('');
    expect(urlDaMelhorOrdem([])).toBe('');
  });

  it('não pede nada quando alguma obra está sem localização', () => {
    expect(urlDaMelhorOrdem([...TRES_OBRAS.slice(0, 2), { lat: null as never, lng: -35.2 }])).toBe('');
  });
});

describe('lerRespostaDaMelhorOrdem', () => {
  const resposta = {
    code: 'Ok',
    trips: [{ duration: 1800, distance: 15000 }],
    // `waypoint_index` é a posição de cada ponto NA VIAGEM; a lista vem na ordem de entrada.
    waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
  };

  it('devolve a ordem das paradas e a duração', () => {
    expect(lerRespostaDaMelhorOrdem(resposta, 3)).toEqual({ ordem: [0, 2, 1], duracaoS: 1800 });
  });

  it.each([
    ['sem code Ok', { ...resposta, code: 'NoRoute' }],
    ['sem viagem', { ...resposta, trips: [] }],
    ['com pontos a menos', { ...resposta, waypoints: [{ waypoint_index: 0 }] }],
    ['com posição repetida', { ...resposta, waypoints: [{ waypoint_index: 0 }, { waypoint_index: 0 }, { waypoint_index: 1 }] }],
    ['sem começar na primeira parada', { ...resposta, waypoints: [{ waypoint_index: 1 }, { waypoint_index: 0 }, { waypoint_index: 2 }] }],
    ['página de erro em vez de resposta', '<html>503</html>'],
    ['nada', null],
  ])('devolve null quando a resposta não serve (%s)', (_caso, json) => {
    expect(lerRespostaDaMelhorOrdem(json, 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/osrm.test.ts`
Expected: FAIL — `urlDaMelhorOrdem` não é exportada.

- [ ] **Step 3: Write the implementation** — em `src/lib/osrm.ts`, abaixo de `urlDaRota`:

```ts
/**
 * 🔴 OUTRO SERVIÇO DO MESMO SERVIDOR. `/route` traça o caminho NA ORDEM DADA; `/trip` resolve
 * qual é a melhor ordem. Trocar um pelo outro sem querer devolve resposta parecida e conselho
 * errado, então os dois endereços ficam separados e cada um tem a sua leitura.
 */
const BASE_TRIP_OSRM = 'https://router.project-osrm.org/trip/v1/driving';

export interface MelhorOrdemDoServico {
  /** Os índices das paradas de ENTRADA, na ordem sugerida. Sempre começa em 0. */
  ordem: number[];
  duracaoS: number;
}

/**
 * A pergunta "qual é a sequência mais rápida?", saindo da PRIMEIRA parada e sem voltar para ela
 * (decisão 2 do desenho: a primeira visita é a combinada, ou a mais perto de casa).
 *
 * Menos de 3 paradas devolve vazio: com 2 não existe ordem melhor, e o hook usa isso para não
 * bater no servidor de graça.
 */
export function urlDaMelhorOrdem(pontos: PontoNoMapa[]): string {
  if (!Array.isArray(pontos) || pontos.length < 3) return '';

  const coordenadas: string[] = [];
  for (const ponto of pontos) {
    if (!ponto || !ehNumeroFinito(ponto.lat) || !ehNumeroFinito(ponto.lng)) return '';
    // 🔴 lng ANTES de lat, como em `urlDaRota`.
    coordenadas.push(`${ponto.lng},${ponto.lat}`);
  }

  // `overview=false`: aqui só interessa a ORDEM e o tempo. O traçado quem desenha é `urlDaRota`,
  // depois, com a ordem já escolhida — pedir geometria duas vezes é peso à toa num servidor de
  // demonstração.
  return `${BASE_TRIP_OSRM}/${coordenadas.join(';')}?source=first&roundtrip=false&destination=any&overview=false`;
}

/**
 * Lê a resposta do `/trip`. Devolve `null` para tudo que não sirva — e aqui isso vale dobrado:
 * uma ordem lida errado não quebra a tela, ela ENSINA O CAMINHO ERRADO para quem vai dirigir.
 *
 * As conferências: código `Ok`, uma viagem com duração numérica, um ponto para cada parada
 * mandada, posições sem repetição dentro da faixa, e a primeira parada continuando em primeiro
 * (foi o que pedimos com `source=first`; se o servidor ignorar, a sugestão não vale).
 */
export function lerRespostaDaMelhorOrdem(json: unknown, totalDePontos: number): MelhorOrdemDoServico | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const resposta = json as Record<string, unknown>;
  if (resposta.code !== 'Ok') return null;

  const viagens = resposta.trips;
  if (!Array.isArray(viagens) || viagens.length === 0) return null;
  const duracaoS = (viagens[0] as Record<string, unknown>)?.duration;
  if (!ehNumeroFinito(duracaoS)) return null;

  const pontos = resposta.waypoints;
  if (!Array.isArray(pontos) || pontos.length !== totalDePontos) return null;

  const posicoes: number[] = [];
  for (const ponto of pontos) {
    const posicao = (ponto as Record<string, unknown>)?.waypoint_index;
    if (!ehNumeroFinito(posicao) || !Number.isInteger(posicao) || posicao < 0 || posicao >= totalDePontos) return null;
    if (posicoes.includes(posicao)) return null;
    posicoes.push(posicao);
  }
  if (posicoes[0] !== 0) return null;

  // `posicoes[i]` diz em que lugar da viagem a parada `i` entrou; a ordem é o caminho inverso.
  const ordem = posicoes.map((_, lugar) => posicoes.indexOf(lugar));
  return { ordem, duracaoS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/osrm.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos e lint** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "osrm"` (Expected: `0`) e `npx eslint src/lib/osrm.ts src/lib/osrm.test.ts`.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/lib/osrm.ts src/lib/osrm.test.ts`.
Mensagem: `feat(rotas): pergunta ao serviço de rotas qual é a sequência mais rápida`

---

### Task 2: A decisão — já ótima, ordem melhor, ou silêncio

**Files:**
- Create: `src/lib/melhor-ordem-da-rota.ts`
- Create: `src/lib/melhor-ordem-da-rota.test.ts`
- Modify: `src/lib/ordem-das-paradas.ts` e `src/lib/ordem-das-paradas.test.ts` (a aplicação da ordem)

**Interfaces:**
- Consumes: `MelhorOrdemDoServico` (Tarefa 1); `ParadaOrdenavel` e `ordenarPorHorario` (`ordem-das-paradas.ts`).
- Produces:
  ```ts
  export const GANHO_MINIMO_S = 300;
  export type CasoDaOrdem = 'ja_otima' | 'ordem_melhor' | 'sem_sugestao';
  export interface AvaliacaoDaOrdem { caso: CasoDaOrdem; ganhoS: number; ordem: number[] | null }
  export function avaliarOrdemDaRota(entrada: {
    duracaoAtualS?: number | null;
    melhorOrdem?: MelhorOrdemDoServico | null;
  }): AvaliacaoDaOrdem;
  // em ordem-das-paradas.ts:
  export function aplicarOrdemMantendoHorarios<T extends ParadaOrdenavel>(paradas: readonly T[], ordem: readonly number[]): T[];
  ```

- [ ] **Step 1: Write the failing test** — crie `src/lib/melhor-ordem-da-rota.test.ts`:

```ts
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
});
```

E acrescente ao teste de `ordem-das-paradas`:

```ts
import { aplicarOrdemMantendoHorarios } from './ordem-das-paradas';

describe('aplicarOrdemMantendoHorarios', () => {
  const paradas = [
    { obraId: 'obra-1', horario: '09:00' },
    { obraId: 'obra-2', horario: '09:30' },
    { obraId: 'obra-3', horario: '15:00' },
  ];

  it('🔴 troca quem ocupa cada horário, e não os horários', () => {
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 2, 1])).toEqual([
      { obraId: 'obra-1', horario: '09:00' },
      { obraId: 'obra-3', horario: '09:30' },
      { obraId: 'obra-2', horario: '15:00' },
    ]);
  });

  it('a grade de horários é exatamente a mesma antes e depois', () => {
    const depois = aplicarOrdemMantendoHorarios(paradas, [0, 2, 1]);
    expect(depois.map((p) => p.horario)).toEqual(paradas.map((p) => p.horario));
  });

  it('ordem inválida devolve a lista como estava — nunca perde nem repete parada', () => {
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1])).toEqual(paradas);
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1, 1])).toEqual(paradas);
    expect(aplicarOrdemMantendoHorarios(paradas, [0, 1, 9])).toEqual(paradas);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/melhor-ordem-da-rota.test.ts src/lib/ordem-das-paradas.test.ts`
Expected: FAIL nos dois — as funções não existem.

- [ ] **Step 3: Write the implementation** — crie `src/lib/melhor-ordem-da-rota.ts`:

```ts
import type { MelhorOrdemDoServico } from './osrm';

/**
 * Vale a pena sugerir outra ordem para as paradas?
 *
 * 🔴 O LIMIAR NÃO É ENFEITE. O tempo vem de um serviço público que não conhece trânsito: é
 * ESTIMATIVA. Sugerir remontar a rota por dois minutos gasta a confiança da pessoa no aviso —
 * e, quando o aviso realmente importar (meia hora a mais de estrada), ela já terá aprendido a
 * ignorá-lo.
 */
export const GANHO_MINIMO_S = 5 * 60;

export type CasoDaOrdem = 'ja_otima' | 'ordem_melhor' | 'sem_sugestao';

export interface AvaliacaoDaOrdem {
  caso: CasoDaOrdem;
  /** Segundos economizados. Zero quando não há o que economizar. */
  ganhoS: number;
  /** Os índices das paradas na ordem sugerida — só em `ordem_melhor`. */
  ordem: number[] | null;
}

const SEM_SUGESTAO: AvaliacaoDaOrdem = { caso: 'sem_sugestao', ganhoS: 0, ordem: null };
const JA_OTIMA: AvaliacaoDaOrdem = { caso: 'ja_otima', ganhoS: 0, ordem: null };

function ehMesmaOrdem(ordem: readonly number[]): boolean {
  return ordem.every((indice, lugar) => indice === lugar);
}

export function avaliarOrdemDaRota({
  duracaoAtualS,
  melhorOrdem,
}: {
  duracaoAtualS?: number | null;
  melhorOrdem?: MelhorOrdemDoServico | null;
}): AvaliacaoDaOrdem {
  // Sem os dois números não há comparação — e "não sei" nunca vira conselho.
  if (!Number.isFinite(duracaoAtualS as number) || !melhorOrdem) return SEM_SUGESTAO;
  const ordem = melhorOrdem.ordem;
  if (!Array.isArray(ordem) || ordem.length === 0) return SEM_SUGESTAO;
  if (!Number.isFinite(melhorOrdem.duracaoS)) return SEM_SUGESTAO;

  if (ehMesmaOrdem(ordem)) return JA_OTIMA;

  const ganhoS = Math.round((duracaoAtualS as number) - melhorOrdem.duracaoS);
  if (ganhoS < GANHO_MINIMO_S) return JA_OTIMA;

  return { caso: 'ordem_melhor', ganhoS, ordem: [...ordem] };
}
```

E acrescente a `src/lib/ordem-das-paradas.ts`:

```ts
/**
 * Reordena as paradas seguindo uma sequência sugerida, **mantendo a grade de horários**.
 *
 * É a mesma promessa de `moverParadaMantendoHorarios`, feita de uma vez para a rota inteira: a
 * pessoa montou as faixas (09:00, 09:30, 15:00 — a terceira obra é longe), e o que muda é quem
 * ocupa cada uma. Inventar horário novo seria decidir pela pessoa algo que ela combinou fora do
 * sistema.
 *
 * Ordem inválida (tamanho diferente, índice repetido ou fora da faixa) devolve a lista como
 * estava: melhor não fazer nada do que embaralhar a rota de alguém.
 */
export function aplicarOrdemMantendoHorarios<T extends ParadaOrdenavel>(
  paradas: readonly T[],
  ordem: readonly number[],
): T[] {
  if (!Array.isArray(ordem) || ordem.length !== paradas.length) return [...paradas];
  const vistos = new Set<number>();
  for (const indice of ordem) {
    if (!Number.isInteger(indice) || indice < 0 || indice >= paradas.length || vistos.has(indice)) {
      return [...paradas];
    }
    vistos.add(indice);
  }

  const grade = ordenarPorHorario(paradas).map((p) => p.horario);
  return ordem.map((indice, lugar) => ({ ...paradas[indice], horario: grade[lugar] }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/melhor-ordem-da-rota.test.ts src/lib/ordem-das-paradas.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos e lint** dos quatro arquivos, comparando com a linha de base.

- [ ] **Step 6: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/melhor-ordem-da-rota.ts src/lib/melhor-ordem-da-rota.test.ts src/lib/ordem-das-paradas.ts src/lib/ordem-das-paradas.test.ts
```
Mensagem: `feat(rotas): decide quando vale sugerir outra ordem, e aplica sem mexer nos horários`

---

### Task 3: O aviso na janela da rota

**Files:**
- Create: `src/hooks/use-melhor-ordem.ts`
- Modify: `src/components/obras/NovaRotaVisitaDialog.tsx`

**Interfaces:**
- Consumes: `urlDaMelhorOrdem`, `lerRespostaDaMelhorOrdem` (T1); `avaliarOrdemDaRota` (T2); `aplicarOrdemMantendoHorarios` (T2); `useRotaOsrm` (o tempo da ordem atual).
- Produces: `export function useMelhorOrdem(pontos: PontoNoMapa[] | null | undefined)` → `{ data: MelhorOrdemDoServico | null, isLoading }`.

- [ ] **Step 1: O gancho da rede.** Crie `src/hooks/use-melhor-ordem.ts`, **copiando as guardas de `use-rota-osrm.ts`** (leia aquele arquivo primeiro):

```ts
import { useQuery } from '@tanstack/react-query';
import { urlDaMelhorOrdem, lerRespostaDaMelhorOrdem, type PontoNoMapa, type MelhorOrdemDoServico } from '@/lib/osrm';

/**
 * A melhor sequência para as paradas, pelo mesmo servidor de demonstração do trajeto — e com as
 * mesmas três guardas, pelos mesmos motivos (ver `use-rota-osrm.ts`): resposta guardada por uma
 * hora, uma tentativa a mais e corte em 12 segundos.
 *
 * 🔴 Diferente do trajeto, aqui o silêncio é a resposta certa quando algo dá errado: sem
 * sugestão a rota continua exatamente como a pessoa montou. Por isso um erro aqui NÃO aparece
 * na tela.
 */
const UMA_HORA = 60 * 60 * 1000;
const LIMITE_MS = 12_000;

export function useMelhorOrdem(pontos: PontoNoMapa[] | null | undefined) {
  const url = pontos ? urlDaMelhorOrdem(pontos) : '';
  const total = pontos?.length ?? 0;

  return useQuery<MelhorOrdemDoServico | null>({
    queryKey: ['melhor-ordem', url],
    enabled: url.length > 0,
    staleTime: UMA_HORA,
    gcTime: UMA_HORA,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const corte = new AbortController();
      const relogio = setTimeout(() => corte.abort(), LIMITE_MS);
      try {
        const resposta = await fetch(url, { signal: corte.signal });
        if (!resposta.ok) return null;
        return lerRespostaDaMelhorOrdem(await resposta.json(), total);
      } catch {
        // Servidor fora, lento ou resposta estranha: sem sugestão, e sem barulho na tela.
        return null;
      } finally {
        clearTimeout(relogio);
      }
    },
  });
}
```

- [ ] **Step 2: O aviso na janela.** Em `NovaRotaVisitaDialog.tsx`:
  - importe `useRotaOsrm`, `useMelhorOrdem`, `avaliarOrdemDaRota`, `aplicarOrdemMantendoHorarios`, `duracaoLegivel` (`@/lib/osrm`);
  - monte os pontos a partir de `paradasEmOrdem` (cada parada precisa de `lat`/`lng` da obra — confira como a lista de obras chega ao componente e, se a parada ainda não guardar coordenada, leve-a junto ao acrescentar a parada);
  - calcule:
    ```ts
    // A ordem só é avaliada com 3+ paradas COM localização — `urlDaMelhorOrdem` já devolve vazio
    // abaixo disso, e o gancho nem sai da tela.
    const pontosDaRota = useMemo(() => paradasComCoordenada(paradasEmOrdem), [paradasEmOrdem]);
    const { data: trajetoAtual } = useRotaOsrm(pontosDaRota);
    const { data: melhorOrdem } = useMelhorOrdem(pontosDaRota);
    const avaliacao = useMemo(
      () => avaliarOrdemDaRota({ duracaoAtualS: trajetoAtual?.duracaoS, melhorOrdem }),
      [trajetoAtual, melhorOrdem],
    );
    ```
  - desenhe, logo acima da lista de paradas:
    ```tsx
    {avaliacao.caso === 'ja_otima' && (
      <p className="rounded-lg border border-green-500/40 bg-green-500/5 px-3 py-2 text-xs text-foreground">
        Perfeito, nosso sistema de rotas aponta esse caminho como o mais produtivo.
      </p>
    )}
    {avaliacao.caso === 'ordem_melhor' && (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
        <p className="text-xs text-foreground">
          Há uma ordem mais rápida: economiza cerca de{' '}
          <span className="font-semibold">{duracaoLegivel(avaliacao.ganhoS)}</span>. Os horários
          continuam os mesmos — muda só qual obra fica em cada um.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setParadas((prev) => aplicarOrdemMantendoHorarios(ordenarPorHorario(prev), avaliacao.ordem!))}
        >
          Usar esta ordem
        </Button>
      </div>
    )}
    ```
  - 🔴 **`ordenarPorHorario(prev)` antes de aplicar**: a ordem sugerida foi calculada sobre a lista **em ordem de horário** (`paradasEmOrdem`), e entre digitar um horário e sair do campo a lista crua pode estar fora de ordem de propósito.

- [ ] **Step 3: Conferência na tela** — `npm run dev`. Monte uma rota com 3 obras geocodificadas fora de ordem: o aviso aparece com o ganho; clique em "Usar esta ordem" e confira que **os horários continuam iguais** e as obras trocaram de faixa. Com 2 paradas, nada aparece. **Não salve.**

- [ ] **Step 4: Tipos, lint e suíte** dos arquivos tocados, comparando com a linha de base; `npm run test` sem regressão.

- [ ] **Step 5: Commit** — `git status --short` separado (⚠️ confira se a outra sessão mexeu no dialog), depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/hooks/use-melhor-ordem.ts src/components/obras/NovaRotaVisitaDialog.tsx
```
Mensagem: `feat(rotas): a janela da rota avisa quando existe ordem mais rápida e oferece trocar`

---

### Task 4: As colunas da análise na visita

**Files:**
- Create: `supabase/migrations/<timestamp>_analise_da_visita.sql`
- Modify: `src/integrations/supabase/types.ts` (à mão — CLAUDE.md §6.8)

**Interfaces:**
- Produces, em `eventos`: `visita_fase` (text), `visita_concorrentes` (text), `visita_contato_id` (uuid → `contatos`), `visita_proximo_passo` (text), `visita_proximo_passo_em` (date).

- [ ] **Step 1: Escreva a migration.** Nome do arquivo no padrão dos vizinhos (`ls supabase/migrations | tail -3` para ver o formato do carimbo de data):

```sql
-- A análise da visita, ao lado do que a visita já guardava (`visita_realizada`,
-- `visita_observacao`, da migration 20260825170000_visitas_obra.sql).
--
-- Por que em `eventos` e não em tabela nova: a parada de rota É um evento de calendário, e a
-- gravação já acontece por `grupo_id` — o grupo inteiro de uma vez, alcançando a cópia de cada
-- participante. Tabela à parte exigiria repetir esse cuidado em outro lugar.
--
-- Sem CHECK na fase de propósito: a lista de fases é vocabulário do ramo e vive no código
-- (`src/lib/analise-da-visita.ts`). Uma trava no banco transformaria "acrescentar uma fase" em
-- migration, e migration não se edita depois.
alter table public.eventos
  add column if not exists visita_fase text,
  add column if not exists visita_concorrentes text,
  add column if not exists visita_contato_id uuid references public.contatos(id) on delete set null,
  add column if not exists visita_proximo_passo text,
  add column if not exists visita_proximo_passo_em date;

comment on column public.eventos.visita_fase is 'Fase da obra vista na visita (fundacao, estrutura, alvenaria, instalacoes, acabamento, entrega).';
comment on column public.eventos.visita_concorrentes is 'Produto ou marca de concorrente visto na obra.';
comment on column public.eventos.visita_proximo_passo is 'O que ficou combinado na visita; vira tarefa quando tem data.';
```

Colunas novas em tabela que já tem RLS **herdam** as políticas de `eventos` — não há política nova a escrever. Confira que é o caso lendo a migration original das visitas.

- [ ] **Step 2: Atualize os tipos à mão.** Em `src/integrations/supabase/types.ts`, na tabela `eventos`, acrescente as cinco colunas em `Row`, `Insert` e `Update` (em `Row` como `string | null` / `string | null` para a data; em `Insert`/`Update` como opcionais). Este ambiente não tem banco local: o arquivo é gerado, mas aqui se edita à mão.

- [ ] **Step 3: Verifique** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "types.ts"` (Expected: não subiu) e `npm run test`.

- [ ] **Step 4: 🔴 NÃO APLIQUE a migration.** Aplicar em produção é gesto do Lucas. No relatório, diga em uma linha: "a migration `<nome>` está escrita e **pendente de aplicação**; as telas da Tarefa 6 em diante só funcionam depois dela".

- [ ] **Step 5: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- supabase/migrations/<arquivo>.sql src/integrations/supabase/types.ts
```
Mensagem: `feat(obras): colunas da análise da visita (fase, concorrente, contato e próximo passo)`

---

### Task 5: As regras da análise — fases, resumo e a tarefa

**Files:**
- Create: `src/lib/analise-da-visita.ts`
- Create: `src/lib/analise-da-visita.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const FASES_DA_OBRA: ReadonlyArray<{ chave: string; rotulo: string }>;
  export function rotuloDaFase(chave?: string | null): string;
  export interface AnaliseDaVisita {
    fase?: string | null; concorrentes?: string | null; contatoNome?: string | null;
    proximoPasso?: string | null; proximoPassoEm?: string | null; observacao?: string | null;
  }
  export function resumoDaAnalise(analise?: AnaliseDaVisita | null): string[];
  export function tarefaDoProximoPasso(entrada: {
    nomeObra?: string | null; clienteId?: string | null;
    proximoPasso?: string | null; proximoPassoEm?: string | null;
  }): { titulo: string; descricao: string; prazo_final: string; cliente_id: string | null } | null;
  ```

- [ ] **Step 1: Write the failing test** — crie `src/lib/analise-da-visita.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FASES_DA_OBRA, rotuloDaFase, resumoDaAnalise, tarefaDoProximoPasso } from './analise-da-visita';

describe('fases da obra', () => {
  it('são as seis do ramo, na ordem do canteiro', () => {
    expect(FASES_DA_OBRA.map((f) => f.chave)).toEqual([
      'fundacao', 'estrutura', 'alvenaria', 'instalacoes', 'acabamento', 'entrega',
    ]);
  });

  it('traduz a chave gravada no rótulo da tela, e não inventa para o que não conhece', () => {
    expect(rotuloDaFase('acabamento')).toBe('Acabamento');
    expect(rotuloDaFase('fase-que-nao-existe')).toBe('');
    expect(rotuloDaFase(null)).toBe('');
  });
});

describe('resumoDaAnalise — o que vai na mensagem', () => {
  it('escreve uma linha por resposta preenchida', () => {
    expect(
      resumoDaAnalise({
        fase: 'acabamento',
        concorrentes: 'Marca Exemplo',
        contatoNome: 'Pessoa Exemplo',
        proximoPasso: 'Mandar proposta de louças',
        proximoPassoEm: '2026-09-20',
        observacao: 'Obra parada por chuva',
      }),
    ).toEqual([
      'Fase: Acabamento',
      'Concorrente: Marca Exemplo',
      'Falou com: Pessoa Exemplo',
      'Próximo passo: Mandar proposta de louças (até 20/09)',
      'Obs.: Obra parada por chuva',
    ]);
  });

  it('pula o que não foi respondido', () => {
    expect(resumoDaAnalise({ fase: 'estrutura' })).toEqual(['Fase: Estrutura']);
    expect(resumoDaAnalise({ proximoPasso: 'Voltar em duas semanas' })).toEqual([
      'Próximo passo: Voltar em duas semanas',
    ]);
  });

  it('visita sem nenhuma resposta não gera linha nenhuma', () => {
    expect(resumoDaAnalise({})).toEqual([]);
    expect(resumoDaAnalise(null)).toEqual([]);
    expect(resumoDaAnalise({ fase: '  ', observacao: '' })).toEqual([]);
  });
});

describe('tarefaDoProximoPasso', () => {
  it('monta a tarefa com o nome da obra no título e a data como prazo', () => {
    expect(
      tarefaDoProximoPasso({
        nomeObra: 'Obra Exemplo',
        clienteId: 'cliente-1',
        proximoPasso: 'Mandar proposta de louças',
        proximoPassoEm: '2026-09-20',
      }),
    ).toEqual({
      titulo: 'Próximo passo — Obra Exemplo',
      descricao: 'Mandar proposta de louças',
      // 🔴 Âncora de meio-dia: a coluna é timestamp e o dia não pode escorregar por fuso.
      prazo_final: '2026-09-20T12:00:00',
      cliente_id: 'cliente-1',
    });
  });

  it('🔴 sem data não vira tarefa — tarefa sem prazo não cobra ninguém', () => {
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPasso: 'Voltar lá' })).toBeNull();
  });

  it('sem próximo passo escrito não vira tarefa', () => {
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPassoEm: '2026-09-20' })).toBeNull();
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPasso: '   ', proximoPassoEm: '2026-09-20' })).toBeNull();
  });

  it('obra sem nome ainda vira tarefa, com rótulo honesto', () => {
    expect(
      tarefaDoProximoPasso({ proximoPasso: 'Voltar lá', proximoPassoEm: '2026-09-20' })?.titulo,
    ).toBe('Próximo passo — obra sem nome');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analise-da-visita.test.ts`
Expected: FAIL — `Failed to resolve import "./analise-da-visita"`.

- [ ] **Step 3: Write the implementation** — crie `src/lib/analise-da-visita.ts`:

```ts
/**
 * A análise que o vendedor deixa quando marca a visita como realizada.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 12/09/2026 havia UMA pergunta aberta ("O que você viu nesta
 * obra?") — e das 6 visitas marcadas como realizadas, só 2 tinham texto. Pergunta aberta é fácil
 * de pular. O desenho de 12/09/2026 trocou por quatro respostas rápidas, todas opcionais, cada
 * uma escolhida por servir para VENDER DEPOIS:
 *
 *   fase da obra .......... diz o que aquela obra vai comprar, e quando
 *   concorrente visto ..... diz quem está ganhando a obra, e com qual marca
 *   com quem falou ........ sem isso a próxima visita recomeça do zero
 *   próximo passo ......... a única resposta que vira trabalho futuro
 */

/** A ordem é a do canteiro, e é ela que a tela mostra. Vocabulário do ramo, não configuração. */
export const FASES_DA_OBRA = [
  { chave: 'fundacao', rotulo: 'Fundação' },
  { chave: 'estrutura', rotulo: 'Estrutura' },
  { chave: 'alvenaria', rotulo: 'Alvenaria' },
  { chave: 'instalacoes', rotulo: 'Instalações' },
  { chave: 'acabamento', rotulo: 'Acabamento' },
  { chave: 'entrega', rotulo: 'Entrega' },
] as const;

/** Rótulo da fase gravada. Chave desconhecida devolve vazio: melhor calar que inventar fase. */
export function rotuloDaFase(chave?: string | null): string {
  return FASES_DA_OBRA.find((f) => f.chave === (chave ?? '').trim())?.rotulo ?? '';
}

export interface AnaliseDaVisita {
  fase?: string | null;
  concorrentes?: string | null;
  contatoNome?: string | null;
  proximoPasso?: string | null;
  /** `AAAA-MM-DD`, como vem do campo de data. */
  proximoPassoEm?: string | null;
  observacao?: string | null;
}

const texto = (valor?: string | null) => (typeof valor === 'string' ? valor.trim() : '');

/** `AAAA-MM-DD` vira `20/09`. Sem `new Date`: a data é texto e nenhum fuso encosta nela. */
function diaEMes(data?: string | null): string {
  const [ano, mes, dia] = texto(data).split('-');
  return ano && mes && dia ? `${dia}/${mes}` : '';
}

/** As linhas prontas da análise — a mensagem do WhatsApp só as indenta e junta. */
export function resumoDaAnalise(analise?: AnaliseDaVisita | null): string[] {
  if (!analise) return [];
  const linhas: string[] = [];

  const fase = rotuloDaFase(analise.fase);
  if (fase) linhas.push(`Fase: ${fase}`);

  const concorrente = texto(analise.concorrentes);
  if (concorrente) linhas.push(`Concorrente: ${concorrente}`);

  const contato = texto(analise.contatoNome);
  if (contato) linhas.push(`Falou com: ${contato}`);

  const passo = texto(analise.proximoPasso);
  if (passo) {
    const quando = diaEMes(analise.proximoPassoEm);
    linhas.push(quando ? `Próximo passo: ${passo} (até ${quando})` : `Próximo passo: ${passo}`);
  }

  const observacao = texto(analise.observacao);
  if (observacao) linhas.push(`Obs.: ${observacao}`);

  return linhas;
}

/**
 * A tarefa do próximo passo — ou `null` quando não há o que cobrar.
 *
 * 🔴 SÓ COM DATA. Tarefa sem prazo não aparece em lista nenhuma de cobrança e vira registro
 * morto, que é justamente o que este trabalho veio resolver.
 *
 * A tarefa liga ao CLIENTE da obra: `tarefas` não tem coluna de obra (medido em 12/09/2026), e
 * criar uma mexeria na tela de tarefas inteira. O nome da obra vai no título, que é onde quem lê
 * a lista procura.
 */
export function tarefaDoProximoPasso({
  nomeObra,
  clienteId,
  proximoPasso,
  proximoPassoEm,
}: {
  nomeObra?: string | null;
  clienteId?: string | null;
  proximoPasso?: string | null;
  proximoPassoEm?: string | null;
}): { titulo: string; descricao: string; prazo_final: string; cliente_id: string | null } | null {
  const passo = texto(proximoPasso);
  const data = texto(proximoPassoEm);
  if (!passo || !data) return null;

  return {
    titulo: `Próximo passo — ${texto(nomeObra) || 'obra sem nome'}`,
    descricao: passo,
    // Âncora de meio-dia, o padrão da casa para data que vira carimbo (CLAUDE.md §7.12): às
    // 00:00 qualquer deslocamento de fuso joga a tarefa para o dia anterior.
    prazo_final: `${data}T12:00:00`,
    cliente_id: clienteId ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analise-da-visita.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Tipos e lint** dos dois arquivos.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/lib/analise-da-visita.ts src/lib/analise-da-visita.test.ts`.
Mensagem: `feat(obras): regras da análise da visita — fases, resumo e a tarefa do próximo passo`

---

### Task 6: As perguntas na tela, e a gravação

**Files:**
- Create: `src/components/obras/PerguntasDaVisita.tsx`
- Modify: `src/hooks/use-obra-visitas.ts`
- Modify: `src/components/obras/VisitasObrasPainel.tsx`
- Modify: `src/components/obras/NovaRotaVisitaDialog.tsx`

**Interfaces:**
- Consumes: `FASES_DA_OBRA` (T5); as colunas da T4; `useContatosDoCliente` (`@/hooks/use-obra-contatos`, o mesmo gancho que o `SeletorContatosObra` usa).
- Produces:
  ```ts
  export interface RespostasDaVisita {
    fase: string; concorrentes: string; contatoId: string;
    proximoPasso: string; proximoPassoEm: string; observacao: string;
  }
  export const RESPOSTAS_VAZIAS: RespostasDaVisita;
  export function PerguntasDaVisita(props: {
    valor: RespostasDaVisita;
    onChange: (v: RespostasDaVisita) => void;
    clienteId?: string | null;   // de quem são os contatos oferecidos
    clienteEmpresa?: string | null;
    disabled?: boolean;
  }): JSX.Element;
  ```
  E `useMarcarVisitaRealizada` passa a aceitar, além de `grupoId`/`obraId`/`realizada`/`observacao`, o objeto `respostas?: RespostasDaVisita`.

- [ ] **Step 1: O componente.** Crie `src/components/obras/PerguntasDaVisita.tsx` com as quatro perguntas mais o texto livre, na ordem do desenho:
  - **Fase da obra**: botões de escolha única a partir de `FASES_DA_OBRA` (um toque; clicar de novo desmarca — resposta opcional precisa poder voltar a ficar vazia);
  - **Concorrente visto**: `<Input>` curto + um botão "Nenhum" que preenche a palavra `Nenhum`;
  - **Com quem falou**: `<Select>` com os contatos daquele cliente (`useContatosDoCliente`), com a opção "— não informar";
  - **Próximo passo**: `<Input>` + `<Input type="date">` ao lado, com a frase de ajuda "sem data, não vira tarefa";
  - **Mais alguma coisa**: o `<Textarea>` de hoje, com o rótulo trocado.

  Comentário obrigatório no topo do arquivo, explicando **por que as perguntas são opcionais** (2 de 6 visitas respondiam a pergunta única; obrigatoriedade faria fechar a tela) e **por que este componente é um só** (é usado nos dois lugares em que se marca "realizada"; duas cópias divergiriam na primeira mudança).

- [ ] **Step 2: A gravação.** Em `src/hooks/use-obra-visitas.ts`:
  - acrescente as colunas novas ao `select` de `useObraVisitas` e ao tipo `ObraVisita` (`visitaFase`, `visitaConcorrentes`, `visitaContatoId`, `visitaProximoPasso`, `visitaProximoPassoEm`);
  - em `useMarcarVisitaRealizada`, aceite `respostas` e grave tudo no mesmo `update`, mantendo o filtro por `grupo_id`:
    ```ts
    const { error } = await supabase
      .from('eventos')
      .update({
        visita_realizada: realizada,
        visita_observacao: observacao || null,
        // Desmarcar a visita apaga a análise junto: análise de visita que não aconteceu é
        // informação inventada. Marcar de novo começa com as perguntas em branco.
        visita_fase: realizada ? respostas?.fase || null : null,
        visita_concorrentes: realizada ? respostas?.concorrentes || null : null,
        visita_contato_id: realizada ? respostas?.contatoId || null : null,
        visita_proximo_passo: realizada ? respostas?.proximoPasso || null : null,
        visita_proximo_passo_em: realizada ? respostas?.proximoPassoEm || null : null,
      })
      .eq('grupo_id', grupoId);
    ```

- [ ] **Step 3: No painel de visitas.** Em `VisitasObrasPainel.tsx`, troque o rascunho de observação por um rascunho de respostas: onde hoje existe `observacaoRascunho` (estado, propriedade do cartão e o `<Textarea>` por volta da linha 562), passe a usar `RespostasDaVisita` e o `<PerguntasDaVisita>`; o `onSalvar` manda `{ grupoId, obraId, realizada: true, observacao: respostas.observacao, respostas }`.

- [ ] **Step 4: Na janela da rota.** Em `NovaRotaVisitaDialog.tsx`, onde cada parada mostra o `<Textarea>` "O que você viu nesta obra?" (dentro do `{parada.realizada && (`), troque pelo `<PerguntasDaVisita>` daquela parada. A `interface Parada` ganha os campos das respostas, e o mapeamento do salvamento leva-os junto — confira em `useCreateRotaVisita` / na atualização da rota como `observacao` viaja hoje e acrescente os novos pelo mesmo caminho.

- [ ] **Step 5: Conferência na tela** — `npm run dev`, com a migration da T4 **já aplicada pelo Lucas**. Se ela ainda não foi aplicada, **pare aqui e avise**: sem as colunas, a gravação falha. Marque uma visita como realizada, responda as quatro perguntas, salve e reabra: as respostas voltam.

- [ ] **Step 6: Tipos, lint e suíte** dos quatro arquivos; `npm run test` sem regressão.

- [ ] **Step 7: Commit** — `git status --short` separado (⚠️ confira a outra sessão), depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/components/obras/PerguntasDaVisita.tsx src/hooks/use-obra-visitas.ts src/components/obras/VisitasObrasPainel.tsx src/components/obras/NovaRotaVisitaDialog.tsx
```
Mensagem: `feat(obras): visita concluída pergunta fase, concorrente, com quem falou e próximo passo`

---

### Task 7: O próximo passo vira tarefa

> 🔴 **REVISADO 16/09/2026 (decisão do Lucas, revisão da 6b).** Esta tarefa cresceu e foi
> dividida em duas partes, e a criação da tarefa deixou de ser automática:
>
> - **A criação da tarefa é OPCIONAL, com uma caixinha "criar tarefa" MARCADA por padrão** —
>   o mesmo padrão do `DialogoRetorno` (pauta do "Hoje"). A caixinha vive em
>   `PerguntasDaVisita` (componente único → aparece nos três lugares) e só aparece quando há
>   próximo passo **com data**. `criarTarefa` entra em `RespostasDaVisita` como campo
>   transitório: **nunca vira coluna**, o mapeamento de gravação já escolhe só os cinco campos.
> - **O GATILHO é a visita TRANSICIONAR para realizada** nesta operação — nunca a cada edição
>   de uma visita que já estava concluída (senão editar o horário recriaria a tarefa).
> - **Task 7a** (esta): a caixinha em `PerguntasDaVisita` + a tarefa no painel da obra
>   (`useMarcarVisitaRealizada`), gated por `respostas.criarTarefa`.
> - **Task 7b** (nova, abaixo): a tarefa também nasce pela janela da rota (criar com "essas
>   visitas já aconteceram", e editar quando uma parada passa a realizada).
>
> Os passos abaixo continuam valendo para o painel da obra; some só o "sempre que houver data",
> que passa a ser "quando houver data **e** a caixinha estiver marcada".

**Files:**
- Modify: `src/hooks/use-obra-visitas.ts`
- Test: `src/hooks/use-obra-visitas.test.tsx` (crie; espelhe o padrão de `src/hooks/use-responsaveis-do-negocio.test.tsx`)

**Interfaces:**
- Consumes: `tarefaDoProximoPasso` (T5); `useCreateTarefa` (`@/hooks/use-tarefas`, aceita `Partial<Tarefa>` e resolve o `usuario_id` de quem está logado).

- [ ] **Step 1: Write the failing test** — um teste de gancho com o Supabase simulado, provando três coisas:

```ts
it('próximo passo com data vira tarefa, com o nome da obra no título', async () => { /* … */ });

it('🔴 a visita continua gravada quando a tarefa falha — e a tela avisa o que faltou', async () => {
  // A visita é o trabalho da pessoa; perdê-la por causa do passo seguinte é o pior desfecho.
});

it('sem data, nenhuma tarefa é criada', async () => { /* … */ });
```

- [ ] **Step 2: Implemente** dentro de `useMarcarVisitaRealizada`, **depois** de a visita gravar com sucesso:

```ts
      // A tarefa nasce DEPOIS da visita, e a falha dela não derruba a gravação: a visita é o
      // trabalho da pessoa em campo; a tarefa é a consequência. Mesmo desenho do aviso de
      // participantes em `useCreatePedidoCompleto`.
      const tarefa = realizada
        ? tarefaDoProximoPasso({
            nomeObra,
            clienteId,
            proximoPasso: respostas?.proximoPasso,
            proximoPassoEm: respostas?.proximoPassoEm,
          })
        : null;
      let avisoDaTarefa: string | null = null;
      if (tarefa) {
        try {
          await criarTarefa(tarefa);
        } catch {
          avisoDaTarefa = 'A visita foi gravada, mas a tarefa do próximo passo não. Crie-a pela tela de Tarefas.';
        }
      }
```
`nomeObra` e `clienteId` precisam chegar até aqui: acrescente-os aos argumentos da mutação (quem chama já tem os dois — o painel lista `visita.nomeObra`, e o cliente vem da obra). Se o chamador não tiver o `clienteId`, mande `null`: a tarefa continua nascendo, só sem o vínculo.

No `onSuccess`, mostre `avisoDaTarefa` com `toast.warning` quando existir, e invalide `['tarefas']` além do que já é invalidado.

- [ ] **Step 3: Run tests** — `npx vitest run src/hooks/use-obra-visitas.test.tsx` (Expected: PASS) e `npm run test`.

- [ ] **Step 4: Tipos e lint**; depois **Commit** (`git status --short` separado):
```bash
git commit -F <arquivo-da-mensagem> --only -- src/hooks/use-obra-visitas.ts src/hooks/use-obra-visitas.test.tsx
```
Mensagem: `feat(obras): o próximo passo da visita vira tarefa com prazo`

---

### Task 8: A fase na ficha da obra

**Files:**
- Modify: `src/components/obras/HistoricoVisitasObra.tsx`

**Interfaces:**
- Consumes: `useObraVisitas` já trazendo `visitaFase` (T6); `rotuloDaFase` (T5).

- [ ] **Step 1: Mostre a última fase conhecida.** No topo do histórico de visitas da obra, acrescente uma linha só:

```tsx
{/* A fase mais recente que alguém respondeu — não a da última visita, porque a última pode ter
    sido registrada sem responder nada. Sem nenhuma resposta, não aparece nada: ausência de
    informação não vira informação. */}
{ultimaFase && (
  <p className="text-xs text-muted-foreground">
    Fase: <span className="font-medium text-foreground">{rotuloDaFase(ultimaFase.fase)}</span>
    {' · visto em '}{format(new Date(ultimaFase.inicio), 'dd/MM')}
  </p>
)}
```
com
```ts
// As visitas já chegam da mais nova para a mais antiga (`useObraVisitas` ordena por `inicio`).
const ultimaFase = useMemo(
  () => (visitas ?? []).find((v) => rotuloDaFase(v.visitaFase) !== ''),
  [visitas],
);
```

- [ ] **Step 2: Conferência na tela** — abra uma obra com visita respondida: a fase aparece com a data; numa obra sem resposta, nada aparece.

- [ ] **Step 3: Tipos, lint, `npm run test`** e **Commit** (`git status --short` separado):
```bash
git commit -F <arquivo-da-mensagem> --only -- src/components/obras/HistoricoVisitasObra.tsx
```
Mensagem: `feat(obras): a ficha da obra mostra a última fase vista em visita`

---

### Task 9: A análise na mensagem do WhatsApp

**Files:**
- Modify: `src/lib/rota-no-whatsapp.ts`
- Modify: `src/lib/rota-no-whatsapp.test.ts`
- Modify: `src/components/obras/VisitasObrasPainel.tsx`

**Interfaces:**
- Consumes: `resumoDaAnalise` (T5).
- Produces: `ParadaDaRota` ganha `analise?: string[] | null` — as linhas prontas.

- [ ] **Step 1: Write the failing test** — acrescente a `src/lib/rota-no-whatsapp.test.ts`:

```ts
it('obra já visitada leva a análise embaixo do nome', () => {
  const texto = mensagemDaRota({
    data: new Date('2026-09-12T12:00:00'),
    paradas: [
      {
        nome: 'Obra Exemplo',
        horario: new Date('2026-09-12T09:00:00'),
        analise: ['Fase: Acabamento', 'Concorrente: Marca Exemplo'],
      },
    ],
  });
  expect(texto).toContain('1. 09:00 — Obra Exemplo');
  expect(texto).toContain('   Fase: Acabamento');
  expect(texto).toContain('   Concorrente: Marca Exemplo');
});

it('obra sem análise sai exatamente como antes', () => {
  const paradas = [{ nome: 'Obra Exemplo', horario: new Date('2026-09-12T09:00:00') }];
  const comCampo = mensagemDaRota({ data: new Date('2026-09-12T12:00:00'), paradas: [{ ...paradas[0], analise: [] }] });
  const semCampo = mensagemDaRota({ data: new Date('2026-09-12T12:00:00'), paradas });
  expect(comCampo).toBe(semCampo);
});

it('o link continua sozinho na última linha, depois da análise', () => {
  const texto = mensagemDaRota({
    data: new Date('2026-09-12T12:00:00'),
    paradas: [{ nome: 'Obra Exemplo', horario: null, lat: -5.79, lng: -35.21, analise: ['Fase: Estrutura'] }],
    link: { url: 'https://www.google.com/maps/dir/?api=1', incluidas: 1, cortadas: 0, semCoordenada: 0 },
  });
  const linhas = texto.split('\n');
  expect(linhas[linhas.length - 1]).toContain('https://www.google.com/maps/dir/');
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/rota-no-whatsapp.test.ts`. Expected: FAIL (a análise não aparece).

- [ ] **Step 3: Implemente.** Em `ParadaDaRota`, acrescente:
```ts
  /**
   * As linhas da análise da visita (`resumoDaAnalise`), quando a obra já foi visitada. Vazio ou
   * ausente deixa a mensagem exatamente como era — quem recebe a rota de manhã não pode notar
   * diferença nenhuma.
   */
  analise?: string[] | null;
```
E, em `mensagemDaRota`, onde hoje há `paradas.forEach((parada, indice) => linhas.push(linhaDaParada(parada, indice + 1)))`:
```ts
    paradas.forEach((parada, indice) => {
      linhas.push(linhaDaParada(parada, indice + 1));
      // Indentado por espaços, e não por "-": no WhatsApp o hífen no começo da linha vira lista
      // e engole o alinhamento com a parada de cima.
      for (const linha of parada?.analise ?? []) {
        if (typeof linha === 'string' && linha.trim()) linhas.push(`   ${linha.trim()}`);
      }
    });
```

- [ ] **Step 4: Ligue na tela.** Em `VisitasObrasPainel.tsx`, onde `mensagemDaRota` é chamada (por volta da linha 181), monte cada parada com `analise: resumoDaAnalise({ fase: v.visitaFase, concorrentes: v.visitaConcorrentes, contatoNome: <nome do contato>, proximoPasso: v.visitaProximoPasso, proximoPassoEm: v.visitaProximoPassoEm, observacao: v.visitaObservacao })` **somente quando `visitaRealizada`** for verdadeiro.

O nome do contato: se a listagem ainda não trouxer o nome, embuta-o no `select` do gancho (`visita_contato_id` → `contatos(nome_contato)`); não faça uma segunda consulta por parada.

- [ ] **Step 5: Run tests** — `npx vitest run src/lib/rota-no-whatsapp.test.ts` (PASS) e `npm run test`.

- [ ] **Step 6: Tipos, lint** e **Commit** (`git status --short` separado):
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/rota-no-whatsapp.ts src/lib/rota-no-whatsapp.test.ts src/components/obras/VisitasObrasPainel.tsx
```
Mensagem: `feat(obras): a mensagem da rota leva a análise de cada obra visitada`

---

### Task 10: Verificação e ensaio na tela

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Suíte, tipos, lint e build**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```
Expected: testes passando; tipos e lint **por arquivo** sem subir; build compila.

- [ ] **Step 2: Ensaio na tela** — `npm run dev`. 🔴 **Nada é salvo em produção e NENHUMA mensagem é enviada**; o ensaio para antes de salvar e antes de enviar. A parte B precisa da migration da Tarefa 4 aplicada pelo Lucas — se ela não foi aplicada, ensaie só a parte A e diga isso no relatório.
  1. Rota com 3 obras fora de ordem: o aviso aparece com o ganho; "Usar esta ordem" troca as obras **mantendo os horários**.
  2. A mesma rota na ordem certa: aparece "Perfeito, nosso sistema de rotas aponta esse caminho como o mais produtivo."
  3. Rota com 2 paradas: nada sobre ordem.
  4. Desligue a rede por 15 segundos e reabra a rota: **nenhuma sugestão**, nenhum erro na tela.
  5. Marcar uma visita como realizada: as quatro perguntas aparecem, todas puláveis; responder e salvar; reabrir e conferir que voltaram.
  6. A tarefa do próximo passo aparece na tela Hoje, com o nome da obra no título.
  7. A ficha da obra mostra "Fase: … · visto em …".
  8. Abrir o envio da rota e conferir **na prévia** (sem enviar) que a análise aparece embaixo da obra visitada, e que o link continua na última linha.
  9. Console do navegador: sem erro novo.

- [ ] **Step 3: Relatório** — para o Lucas, em linguagem de tela: o que cada ensaio mostrou, com captura dos passos 1, 2, 5 e 8; o total de testes; a contagem por arquivo de tipos e lint; e 🔴 **o lembrete de que a migration está pendente de aplicação**. **Não publique.**

---

## Fora deste plano — anotado para o Lucas decidir

| O quê | Por quê |
|---|---|
| Coluna de obra em `tarefas` | Mexeria na tela de tarefas inteira; hoje a tarefa liga ao cliente e nomeia a obra |
| Tabela de rota de verdade | O dia continua sendo a rota; criar tabela é remodelar a agenda |
| Fases configuráveis por empresa | Vocabulário do ramo; se alguém pedir, vira pedido próprio |
| Servidor de rotas contratado | O de demonstração é o que existe; sem ele o sistema só deixa de sugerir |
| Relatório de visitas por período (quantas obras em cada fase, concorrente mais visto) | Agora os dados passam a existir. Vira pedido próprio, e precisa da pergunta do período (CLAUDE.md §5) |
