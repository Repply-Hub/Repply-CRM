# Hoje: tentativas, filtro de data, e-mail por pessoa e ordenação — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela "Hoje", priorizar e destacar negócios já perseguidos, permitir recorte por
período no bloco "No geral", permitir ordenar a tabela de risco por qualquer coluna, e deixar o
gestor escolher pessoa a pessoa quem recebe o e-mail da pauta.

**Architecture:** A maioria da lógica mora em funções de banco (`pauta_do_dia_de`,
`negocios_em_risco`/`_de`, `dashboard_negocios_risco`, `pauta_resumo_destinatarios`). O front lê os
campos novos e desenha os controles. A preferência de e-mail por pessoa entra na tabela chave/valor
`configuracoes_automacao`, que já existe. As tarefas de front são testáveis com o `supabase.rpc`
mockado (padrão dos testes atuais); o banco é provado por ENSAIO (não há banco local).

**Tech Stack:** React 18 + TS + Vite; TanStack Query; shadcn/Radix; Vitest + Testing Library;
Supabase (Postgres + Edge Functions).

**Desenho:** `docs/superpowers/specs/2026-09-15-hoje-tentativas-filtro-email-e-ordenacao-design.md`.

## Global Constraints

- **PT-BR** em tela, comentário, commit e mensagem de erro. Responder ao Lucas em PT-BR.
- **Nada de dado real** de cliente/equipe em teste, comentário ou migration (repo público, §6.9).
  Exemplos inventados: "Ana Souza", "Bruno Lima", "Obra Exemplo", valores como 180000.
- **Git (§13):** nunca `git add -A` nem `git stash`. Commit com `git commit --only -- <arquivos>`,
  listando os arquivos um a um; conferir `git status --short` num comando separado antes. Publicar
  (push) é gesto do controlador, no fim, só dos commits próprios, por cópia isolada — NÃO é tarefa
  de implementador.
- **Verificação (§9):** `npm run test` passa limpo; `npx vitest run <arquivo>` para um teste;
  `npx tsc --noEmit -p tsconfig.app.json` (com o `-p`; base 36 erros, não pode subir);
  `npm run build` compila; `npm run lint` não sobe o número herdado.
- **Banco:** migration nova para cada mudança (§6.3, nunca editar existente). Função recriada por
  `DROP`+`CREATE` restaura o `GRANT`/`REVOKE` EXATO de antes (o `DROP` apaga a permissão em
  silêncio) e a migration termina com `NOTIFY pgrst, 'reload schema'`, dentro de `BEGIN/COMMIT`.
  `negocios_em_risco_de` continua **fechada a `authenticated`** (só `service_role`).
- **Aplicar banco em produção** = ensaio + rota de volta + "pode" do Lucas (memórias
  `ensaio-de-migration-em-producao`, `escrita-em-producao-passa-pela-mao-do-lucas`). Mudança visual
  = foto mostrada ao Lucas antes de publicar.
- **`types.ts` é atualizado à mão** (§6.8) — não há banco local; a Tarefa 1 estabelece o contrato.
- **Ordem de publicação:** aplicar a migration ANTES de publicar o front que manda parâmetros novos
  (os parâmetros têm DEFAULT, então o site atual segue funcionando após a migration).
- **Fuso/calendário:** ler data do banco com âncora de meio-dia (§7.12); todo `<Calendar>` com
  `defaultMonth`, `captionLayout="dropdown-buttons"`, `fromYear`/`toYear` (§7.13).

---

## Mapa de arquivos

**Novos:**
- `src/components/pauta/EtiquetaDeTentativa.tsx` — a etiqueta "Nª tentativa" (Parte 1).
- `src/components/pauta/EtiquetaDeTentativa.test.tsx`.
- `src/components/pauta/PeriodoDoPainel.tsx` — o seletor de período da barra de filtros (Parte 2).
- `supabase/migrations/<versão>_hoje_tentativas_filtro_e_ordenacao.sql` — recria as funções.

**Modificados:**
- `src/integrations/supabase/types.ts` — assinaturas/colunas das RPCs (Tarefa 1).
- `src/hooks/use-pauta.ts` — `ItemDaPauta.tentativas` (Parte 1).
- `src/hooks/use-dashboard.ts` — `NegocioEmRisco.tentativas`; params de data e ordenação nos hooks.
- `src/pages/Hoje.tsx` — `ItemPauta` desenha a etiqueta de tentativa.
- `src/components/pauta/TabelaDoTime.tsx` — etiqueta de tentativa + ordenação por coluna.
- `src/lib/filtros-do-painel.ts` — período no endereço + `recorteParaOServidor`.
- `src/components/pauta/BarraDeFiltros.tsx` — o seletor de período (para todos).
- `src/components/pauta/RadarDeRisco.tsx` — repassa o período; ajusta o texto do cabeçalho.
- `src/hooks/use-configuracoes-automacao.ts` — chave `pauta_resumo_excluidos` + validação de texto.
- `src/components/configuracoes/AutomacaoTab.tsx` — lista da equipe (opt-out).

**Testes ao lado** dos arquivos acima, ou em `src/test/`.

---

## Contrato das funções de banco (o que a Tarefa 1 e a Tarefa 9 precisam bater)

Assinaturas FINAIS (parâmetros novos ao FIM, com DEFAULT, para o site atual seguir chamando):

- `negocios_em_risco(p_usuario_ids uuid[], p_fabricante_ids uuid[], p_funil_id uuid, p_dias_parado int, p_etapas text[], p_limite int, p_deslocamento int, p_data_de date DEFAULT NULL, p_data_ate date DEFAULT NULL, p_ordenar_por text DEFAULT 'valor', p_ascendente boolean DEFAULT false)`
  → `RETURNS TABLE(... colunas de hoje ..., tentativas int)` — a coluna `tentativas` ao fim.
- `negocios_em_risco_de(p_usuario_id uuid, ... os mesmos params novos ...)` → idem, com
  `valor_geral` como hoje e `tentativas` ao fim.
- `dashboard_negocios_risco(... params de hoje ..., p_data_de date DEFAULT NULL, p_data_ate date DEFAULT NULL)` → mesmo `RETURNS TABLE` de hoje (só ganha o filtro).
- `pauta_do_dia_de(p_usuario_id uuid)` → `RETURNS TABLE(... colunas de hoje ..., tentativas int)`.
- `pauta_do_dia()` → mesma forma nova de `pauta_do_dia_de` (é `select * from pauta_do_dia_de(...)`).
- `pauta_resumo_destinatarios()` → **inalterada** na assinatura e no retorno (só muda o corpo).

`tentativas` = `count(*)` de `historico_contatos` daquele `pedido_id` com `tipo='retorno'`.
Numeração na tela = `tentativas + 1` (o envio é a 1ª); etiqueta só a partir de `tentativas >= 1`.

---

## Task 1: Contrato dos tipos (types.ts)

**Files:**
- Modify: `src/integrations/supabase/types.ts` (entradas `negocios_em_risco`, `negocios_em_risco_de`, `dashboard_negocios_risco`, `pauta_do_dia`, `pauta_do_dia_de` em `Functions`).

**Interfaces:**
- Produces: os tipos gerados passam a listar `p_data_de`, `p_data_ate`, `p_ordenar_por`,
  `p_ascendente` em `negocios_em_risco`/`_de`; `p_data_de`/`p_data_ate` em
  `dashboard_negocios_risco`; e a coluna `tentativas: number` nos `Returns` de
  `negocios_em_risco`/`_de`, `pauta_do_dia`/`pauta_do_dia_de`.

Não há teste unitário de tipos. A prova é o `tsc` não subir de 36 e o build compilar depois que as
tarefas seguintes usarem os campos.

- [ ] **Step 1: Localizar as entradas.** Em `types.ts`, achar as chaves `negocios_em_risco`,
  `negocios_em_risco_de`, `dashboard_negocios_risco`, `pauta_do_dia`, `pauta_do_dia_de` dentro de
  `Database['public']['Functions']`.

- [ ] **Step 2: Acrescentar os `Args` novos.** Em `negocios_em_risco` e `negocios_em_risco_de`,
  adicionar em `Args`: `p_data_de?: string; p_data_ate?: string; p_ordenar_por?: string;
  p_ascendente?: boolean`. Em `dashboard_negocios_risco`: `p_data_de?: string; p_data_ate?: string`.
  (Opcionais com `?` porque têm DEFAULT no banco.)

- [ ] **Step 3: Acrescentar `tentativas` aos `Returns`.** Em `negocios_em_risco`,
  `negocios_em_risco_de`, `pauta_do_dia` e `pauta_do_dia_de`, adicionar `tentativas: number` ao
  objeto de `Returns`.

- [ ] **Step 4: Verificar tipos.** Run: `npx tsc --noEmit -p tsconfig.app.json` — Expected: total de
  erros continua 36 (não subiu).

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "types(hoje): assinaturas das RPCs com data, ordenacao e tentativas" -- src/integrations/supabase/types.ts
```

---

## Task 2: EtiquetaDeTentativa (Parte 1, componente puro)

**Files:**
- Create: `src/components/pauta/EtiquetaDeTentativa.tsx`
- Test: `src/components/pauta/EtiquetaDeTentativa.test.tsx`

**Interfaces:**
- Produces: `export function EtiquetaDeTentativa({ tentativas, className }: { tentativas: number; className?: string }): JSX.Element | null` — devolve `null` quando `tentativas <= 0`; senão uma etiqueta com o texto `${tentativas + 1}ª tentativa` e um ícone de repetir.

- [ ] **Step 1: Escrever o teste que falha.**
```tsx
// src/components/pauta/EtiquetaDeTentativa.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EtiquetaDeTentativa } from './EtiquetaDeTentativa';

describe('EtiquetaDeTentativa', () => {
  it('não desenha nada quando não houve retomada', () => {
    const { container } = render(<EtiquetaDeTentativa tentativas={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uma retomada é a "2ª tentativa" (o envio é a 1ª)', () => {
    render(<EtiquetaDeTentativa tentativas={1} />);
    expect(screen.getByText('2ª tentativa')).toBeInTheDocument();
  });

  it('três retomadas viram "4ª tentativa"', () => {
    render(<EtiquetaDeTentativa tentativas={3} />);
    expect(screen.getByText('4ª tentativa')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/pauta/EtiquetaDeTentativa.test.tsx` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar.**
```tsx
// src/components/pauta/EtiquetaDeTentativa.tsx
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A ETIQUETA DE NEGÓCIO PERSEGUIDO — pedido de 15/09/2026.
 *
 * `tentativas` é o número de "Retomar depois" já registrados no negócio. Como o primeiro envio do
 * orçamento já conta como a 1ª tentativa, o texto é `tentativas + 1`: uma retomada é a "2ª".
 * Substitui a etiqueta "Orçamento parado" — um cliente cobrado várias vezes não está "parado", e
 * é o que mais pede atenção. Fundo laranja da marca, mais forte que o vermelho de parado.
 */
export function EtiquetaDeTentativa({ tentativas, className }: { tentativas: number; className?: string }) {
  if (tentativas <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground',
        className,
      )}
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {tentativas + 1}ª tentativa
    </span>
  );
}
```

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/components/pauta/EtiquetaDeTentativa.test.tsx` — Expected: PASS (3 testes).

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(hoje): etiqueta de negocio perseguido (Nª tentativa)" -- src/components/pauta/EtiquetaDeTentativa.tsx src/components/pauta/EtiquetaDeTentativa.test.tsx
```

---

## Task 3: Período no filtro do painel (Parte 2, lib pura)

**Files:**
- Modify: `src/lib/filtros-do-painel.ts`
- Test: `src/lib/filtros-do-painel.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: nada.
- Produces: `FiltrosDoPainel` ganha `dataDe?: string` e `dataAte?: string` (texto `AAAA-MM-DD`);
  `lerFiltrosDoEndereco`/`escreverFiltrosNoEndereco` leem/gravam `data_de`/`data_ate`;
  `recorteParaOServidor` devolve `dataDe`/`dataAte` (para TODOS — não dependem da chave, diferente
  de `usuarioIds`).

- [ ] **Step 1: Escrever o teste que falha.**
```ts
// src/lib/filtros-do-painel.test.ts
import { describe, it, expect } from 'vitest';
import {
  lerFiltrosDoEndereco, escreverFiltrosNoEndereco, recorteParaOServidor,
} from './filtros-do-painel';

describe('filtros do painel — período', () => {
  it('lê data_de e data_ate do endereço', () => {
    const f = lerFiltrosDoEndereco(new URLSearchParams('data_de=2026-01-01&data_ate=2026-03-31'));
    expect(f.dataDe).toBe('2026-01-01');
    expect(f.dataAte).toBe('2026-03-31');
  });

  it('período vazio não vira chave no endereço', () => {
    const p = escreverFiltrosNoEndereco(new URLSearchParams(), {
      etapas: [], fabricantes: [], responsaveis: [],
    });
    expect(p.has('data_de')).toBe(false);
    expect(p.has('data_ate')).toBe(false);
  });

  it('o período vai ao servidor mesmo sem a chave de ver a equipe', () => {
    const f = { etapas: [], fabricantes: [], responsaveis: [], dataDe: '2026-01-01', dataAte: '2026-03-31' };
    const semChave = recorteParaOServidor(f, false);
    expect(semChave.dataDe).toBe('2026-01-01');
    expect(semChave.dataAte).toBe('2026-03-31');
    expect(semChave.usuarioIds).toBeUndefined(); // responsável continua gated
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/lib/filtros-do-painel.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar.** Em `filtros-do-painel.ts`:
  - No `interface FiltrosDoPainel`, acrescentar `dataDe?: string;` e `dataAte?: string;`.
  - Em `lerFiltrosDoEndereco`, acrescentar `dataDe: params.get('data_de') ?? undefined,
    dataAte: params.get('data_ate') ?? undefined,`.
  - Em `escreverFiltrosNoEndereco`, depois do laço das listas, tratar as duas datas:
    `for (const [chave, valor] of [['data_de', filtros.dataDe], ['data_ate', filtros.dataAte]] as const) { if (valor) saida.set(chave, valor); else saida.delete(chave); }`.
  - Na assinatura de `recorteParaOServidor`, acrescentar ao retorno
    `dataDe: filtros.dataDe, dataAte: filtros.dataAte`. Atualizar o tipo de retorno para incluir
    `dataDe?: string; dataAte?: string`.

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/lib/filtros-do-painel.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(hoje): periodo opcional nos filtros do painel No geral" -- src/lib/filtros-do-painel.ts src/lib/filtros-do-painel.test.ts
```

---

## Task 4: Preferência de e-mail por pessoa no hook de config (Parte 3, dados)

**Files:**
- Modify: `src/hooks/use-configuracoes-automacao.ts`
- Test: `src/hooks/use-configuracoes-automacao.test.ts` (criar se não existir; ver padrão de mock de `@/integrations/supabase/client` em `src/components/pauta/tabela-do-time.test.tsx`)

**Interfaces:**
- Produces: `PADROES_DA_PAUTA` ganha `pauta_resumo_excluidos: [] as string[]`; a leitura valida array
  de texto; `ChaveDaPauta` inclui a chave; `useSalvarConfiguracaoAutomacao` aceita `string[]`.

- [ ] **Step 1: Escrever o teste que falha.** (mock do supabase devolvendo a linha da chave)
```ts
// src/hooks/use-configuracoes-automacao.test.ts — teste da validação de valor
import { describe, it, expect } from 'vitest';
import { PADROES_DA_PAUTA } from './use-configuracoes-automacao';

describe('configurações da pauta — excluídos do e-mail', () => {
  it('o padrão é ninguém excluído', () => {
    expect(PADROES_DA_PAUTA.pauta_resumo_excluidos).toEqual([]);
  });
});
```
> Nota: a validação de array-de-texto vive dentro do `queryFn`; um teste de integração do hook
> (com `QueryClientProvider` e o mock do client) confirma que uma linha `["id1","id2"]` é aceita e
> uma linha corrompida (número no lugar de texto) cai no padrão `[]`. Escrever ambos.

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/hooks/use-configuracoes-automacao.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar.** Em `use-configuracoes-automacao.ts`:
  - Em `PADROES_DA_PAUTA`, acrescentar `pauta_resumo_excluidos: [] as string[],` com comentário
    explicando que é lista de EXCLUÍDOS por empresa (ausência = todos recebem, inclusive quem entra
    depois).
  - Na validação do `queryFn`, o ramo `Array.isArray(padrao)` hoje só aceita `every(v => typeof v
    === 'number')`. Trocar por: se o padrão é array de número, exigir números; se é array de texto
    (o caso da nova chave), exigir `every(v => typeof v === 'string')`. Ex.:
    ```ts
    if (Array.isArray(padrao)) {
      const todosDoTipo = (t: string) => Array.isArray(bruto) && bruto.every((v) => typeof v === t);
      const tipoDoPadrao = padrao.length > 0 ? typeof padrao[0] : (chave === 'pauta_resumo_excluidos' ? 'string' : 'number');
      if (todosDoTipo(tipoDoPadrao)) (resultado[chave] as unknown[]) = bruto as unknown[];
    }
    ```
    (Cuidar do array vazio: o padrão `[]` não revela o tipo; por isso a chave decide o tipo esperado.)
  - Em `useSalvarConfiguracaoAutomacao`, alargar o tipo de `valor` para
    `number | boolean | number[] | string[]`.

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/hooks/use-configuracoes-automacao.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(automacao): preferencia de quem NAO recebe o e-mail da pauta, por empresa" -- src/hooks/use-configuracoes-automacao.ts src/hooks/use-configuracoes-automacao.test.ts
```

---

## Task 5: Etiqueta de tentativa na pauta e na tabela (Parte 1, integração)

**Files:**
- Modify: `src/hooks/use-pauta.ts` (tipo `ItemDaPauta`), `src/hooks/use-dashboard.ts` (tipo `NegocioEmRisco`), `src/pages/Hoje.tsx` (`ItemPauta`), `src/components/pauta/TabelaDoTime.tsx`.
- Test: `src/pages/Hoje.test.tsx` (existe), `src/components/pauta/tabela-do-time.test.tsx` (existe).

**Interfaces:**
- Consumes: `EtiquetaDeTentativa` (Task 2); `tentativas` das RPCs (Task 1 no tipo).
- Produces: `ItemDaPauta.tentativas?: number`; `NegocioEmRisco.tentativas?: number`.

- [ ] **Step 1: Testes que falham.**
  - Em `tabela-do-time.test.tsx`: uma linha com `tentativas: 2` mostra "3ª tentativa"; uma com
    `tentativas: 0` NÃO mostra "tentativa". (Adicionar `tentativas` ao factory de linha do mock.)
  - Em `Hoje.test.tsx`: um item de pauta parado com `tentativas: 1` mostra "2ª tentativa" e NÃO
    mostra "Orçamento parado"; com `tentativas: 0` mostra o selo do banco ("Orçamento parado").
```tsx
// esboço (tabela-do-time.test.tsx) — dentro do describe existente
it('a linha perseguida mostra a etiqueta de tentativa', async () => {
  // mock devolve uma linha com tentativas: 2
  montar();
  expect(await screen.findByText('3ª tentativa')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/pauta/tabela-do-time.test.tsx src/pages/Hoje.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - `use-pauta.ts`: em `ItemDaPauta`, acrescentar `/** Nº de retomadas já registradas (0 = nenhuma). */ tentativas?: number;`. Onde a RPC é lida, o campo já chega no objeto — nada mais a fazer além do tipo.
  - `use-dashboard.ts`: em `NegocioEmRisco`, acrescentar `tentativas?: number;`.
  - `Hoje.tsx`, `ItemPauta`: importar `EtiquetaDeTentativa`. No bloco do selo (linhas ~94-103),
    quando NÃO é compromisso e `item.tentativas && item.tentativas > 0`, desenhar
    `<EtiquetaDeTentativa tentativas={item.tentativas} />` NO LUGAR do `<span>` do selo; senão o
    selo de hoje. Manter o selo do compromisso intacto.
  - `TabelaDoTime.tsx`: importar `EtiquetaDeTentativa`. Na célula do nome (linhas ~418-424), depois
    do `<span>` do nome, quando `n.tentativas && n.tentativas > 0`, desenhar
    `<EtiquetaDeTentativa tentativas={n.tentativas} className="mt-1" />` (bloco abaixo do nome, para
    não competir com o `line-clamp-2`).

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/components/pauta/tabela-do-time.test.tsx src/pages/Hoje.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(hoje): pauta e tabela do time destacam o negocio perseguido" -- src/hooks/use-pauta.ts src/hooks/use-dashboard.ts src/pages/Hoje.tsx src/components/pauta/TabelaDoTime.tsx src/components/pauta/tabela-do-time.test.tsx src/pages/Hoje.test.tsx
```

---

## Task 6: Seletor de período na barra + hooks (Parte 2, integração)

**Files:**
- Create: `src/components/pauta/PeriodoDoPainel.tsx`
- Modify: `src/components/pauta/BarraDeFiltros.tsx`, `src/hooks/use-dashboard.ts` (`useNegociosEmRisco`, `useDashboardNegociosRisco`), `src/components/pauta/RadarDeRisco.tsx`.
- Test: `src/lib/filtros-do-painel.test.ts` (já cobre o recorte); `src/components/pauta/barra-de-filtros.test.tsx` (criar).

**Interfaces:**
- Consumes: `FiltrosDoPainel.dataDe/dataAte` e `recorteParaOServidor` (Task 3).
- Produces: os hooks passam `p_data_de`/`p_data_ate` e os incluem na `queryKey`. `TabelaDoTime`
  recebe `filtros` que já pode ter `dataDe`/`dataAte` (repassa ao hook).

- [ ] **Step 1: Testes que falham.**
  - `barra-de-filtros.test.tsx`: o seletor de período aparece TANTO com `podeFiltrarPorResponsavel`
    true quanto false (diferente do de Responsável).
  - Um teste do hook `useNegociosEmRisco` (com o client mockado) confirmando que `p_data_de`/`p_data_ate`
    vão na chamada quando presentes, e `null` quando ausentes.

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/pauta/barra-de-filtros.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - `PeriodoDoPainel.tsx`: um botão com `Popover` + dois `<Calendar>` (De / Até) ou um
    `DateRangePicker` se já houver um no projeto (procurar `DateRangePicker` antes de criar). Chama
    `onChange({ dataDe, dataAte })` com texto `AAAA-MM-DD` (usar `format(d, 'yyyy-MM-dd')`, §7.12);
    botão "Limpar período" zera as duas. Passar `defaultMonth`, `captionLayout`, `fromYear=2020`,
    `toYear=<ano atual>` (§7.13).
  - `BarraDeFiltros.tsx`: renderizar `<PeriodoDoPainel dataDe={filtros.dataDe} dataAte={filtros.dataAte}
    onChange={(p) => onChange({ ...filtros, ...p })} />` SEM guarda de permissão (para todos). Somar
    o período à contagem `quantos` do crachá de filtros e ao "Limpar" (o "Limpar" zera período também).
  - `use-dashboard.ts`, `useNegociosEmRisco` e `useDashboardNegociosRisco`: extrair `dataDe`, `dataAte`
    de `filtros`/`filters`; incluí-los na `queryKey`; passar `p_data_de: dataDe ?? null, p_data_ate:
    dataAte ?? null` no `.rpc(...)`.
  - `RadarDeRisco.tsx`: o `recorte` já vem de `recorteParaOServidor`, que agora carrega o período;
    ele já é repassado aos hooks e à `TabelaDoTime`. Ajustar o texto do cabeçalho: quando há período,
    trocar "É a foto de agora — não depende de período." por algo como "No período escolhido."

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/components/pauta/barra-de-filtros.test.tsx src/lib/filtros-do-painel.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(hoje): filtro de periodo opcional no No geral, para todos, por data de criacao" -- src/components/pauta/PeriodoDoPainel.tsx src/components/pauta/BarraDeFiltros.tsx src/hooks/use-dashboard.ts src/components/pauta/RadarDeRisco.tsx src/components/pauta/barra-de-filtros.test.tsx
```

---

## Task 7: Ordenação por coluna na tabela do time (Parte 4)

**Files:**
- Modify: `src/components/pauta/TabelaDoTime.tsx`, `src/hooks/use-dashboard.ts` (`useNegociosEmRisco`).
- Test: `src/components/pauta/tabela-do-time.test.tsx`.

**Interfaces:**
- Consumes: `useNegociosEmRisco` (ganha `ordenarPor`/`ascendente` em `filtros`).
- Produces: `TabelaDoTime` guarda `{ coluna, ascendente }` (padrão `valor`/false), manda ao hook,
  volta o "Ver mais" para 10 ao trocar a ordenação.

Colunas ordenáveis (chave da coluna → `p_ordenar_por`): `negocio`, `fabricante`, `etapa`,
`responsavel` (só com a chave), `valor`, `dias`. `acoes` não ordena.

- [ ] **Step 1: Testes que falham.**
```tsx
// tabela-do-time.test.tsx
it('ordenar por Valor crescente manda p_ordenar_por=valor e p_ascendente=true, e volta para 10', async () => {
  montar();
  // abrir o menu do título "Valor" e escolher "Menor valor primeiro"
  // ...
  await waitFor(() => {
    const ultima = chamadas.at(-1); // as chamadas capturadas do rpc mock
    expect(ultima.p_ordenar_por).toBe('valor');
    expect(ultima.p_ascendente).toBe(true);
    expect(ultima.p_limite).toBe(10);
  });
});
it('a coluna de ações não tem menu de ordenação', () => { /* querySpecífico */ });
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/pauta/tabela-do-time.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - `use-dashboard.ts`, `useNegociosEmRisco`: aceitar `ordenarPor?: string; ascendente?: boolean` em
    `filtros`; incluir na `queryKey`; passar `p_ordenar_por: ordenarPor ?? 'valor', p_ascendente:
    ascendente ?? false`.
  - `TabelaDoTime.tsx`: estado `const [ordem, setOrdem] = useState<{ coluna: string; ascendente: boolean }>({ coluna: 'valor', ascendente: false })`. Um `ordenarPor(coluna, ascendente)` que
    `setOrdem(...)` e `setQuantos(PAGINA)`. Incluir `ordem` na `chaveDoRecorte` (para o reset-para-10
    já existente cobrir também a troca de ordenação) e passá-lo ao `useNegociosEmRisco`. No título de
    cada coluna ordenável, acrescentar um menu (usar o `DropdownMenu` como no `SortableTh`, ou
    reaproveitar `SortableTh` só para a parte do menu) com "Ordenar do maior/menor" (ou A–Z/Z–A para
    texto), marcando a opção ativa. O clique do menu não deve disparar a alça de largura
    (`stopPropagation` no gatilho). Ajustar o subtítulo do cartão para refletir a ordenação atual.

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/components/pauta/tabela-do-time.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(hoje): tabela do time ordena por qualquer coluna, no servidor" -- src/components/pauta/TabelaDoTime.tsx src/hooks/use-dashboard.ts src/components/pauta/tabela-do-time.test.tsx
```

---

## Task 8: Lista da equipe na aba Automação (Parte 3, UI)

**Files:**
- Modify: `src/components/configuracoes/AutomacaoTab.tsx`
- Test: `src/components/configuracoes/automacao-tab.test.tsx` (criar; mockar `useVendedores`, `useConfiguracoesAutomacao`, `useSalvarConfiguracaoAutomacao`)

**Interfaces:**
- Consumes: `useVendedores` (`@/hooks/use-clientes`), `pauta_resumo_excluidos` (Task 4).

- [ ] **Step 1: Testes que falham.**
  - Com dois usuários e `pauta_resumo_excluidos: []`, as duas caixas aparecem MARCADAS.
  - Desmarcar "Ana Souza" grava `pauta_resumo_excluidos` com o id dela.
  - Com o resumo por e-mail DESLIGADO, a lista fica desabilitada.

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/configuracoes/automacao-tab.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implementar.** Em `AutomacaoTab.tsx`, dentro do card "Resumo diário por e-mail",
  abaixo dos dias da semana: uma lista de `useVendedores()`; para cada pessoa, um `Checkbox`
  (`@/components/ui/checkbox`) marcado quando `!config.pauta_resumo_excluidos.includes(v.id)`.
  Alternar: montar a lista nova de excluídos e `gravar('pauta_resumo_excluidos', nova)`. Desabilitar
  a lista inteira quando `!config.pauta_resumo_email` (como os dias). Texto de ajuda: "Todos recebem
  por padrão. Desmarque quem não deve receber."

- [ ] **Step 4: Rodar e ver passar.** Run: `npx vitest run src/components/configuracoes/automacao-tab.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git status --short
git commit --only -m "feat(automacao): gestor escolhe quem recebe o e-mail da pauta, todos por padrao" -- src/components/configuracoes/AutomacaoTab.tsx src/components/configuracoes/automacao-tab.test.tsx
```

---

## Task 9: Migration do banco (todas as funções) + ensaio

**Files:**
- Create: `supabase/migrations/<versão>_hoje_tentativas_filtro_e_ordenacao.sql`

> Esta tarefa NÃO tem teste de Vitest (não há banco local). A prova é o ENSAIO. É a última a ser
> feita, e a aplicação em produção é GATED pelo "pode" do Lucas.

**Procedimento (não "escrever de cabeça"):**

- [ ] **Step 1: Conferir prefixo de versão** nos dois lados (memória `versao-de-migration-pode-colidir`):
  `ls supabase/migrations | grep '^20260915'` e `git ls-tree --name-only origin/main supabase/migrations/ | grep 20260915`. Escolher minuto não-redondo.

- [ ] **Step 2: Colher as definições vivas** com `pg_get_functiondef` (via MCP `execute_sql`, só
  leitura) das cinco funções: `pauta_do_dia_de`, `pauta_do_dia`, `negocios_em_risco`,
  `negocios_em_risco_de`, `dashboard_negocios_risco`, `pauta_resumo_destinatarios`. Guardar o md5 de
  cada `prosrc` (é a base da rota de volta).

- [ ] **Step 3: Escrever a migration** aplicando SOBRE as definições vivas:
  - **`negocios_em_risco_de`:** acrescentar params `p_data_de`, `p_data_ate`, `p_ordenar_por`,
    `p_ascendente` ao FIM; no `WHERE` de `abertos`, `(p_data_de IS NULL OR p.data_pedido >= p_data_de)`
    e `(p_data_ate IS NULL OR p.data_pedido <= p_data_ate)`; em `marcado`/`abertos`, calcular
    `tentativas` = `(SELECT count(*) FROM public.historico_contatos hc WHERE hc.pedido_id = a.id AND hc.tipo = 'retorno')::int`; devolver `tentativas` ao FIM do SELECT e do `RETURNS TABLE`; trocar o
    `ORDER BY` interno por uma LISTA BRANCA de `CASE` (uma cláusula por coluna permitida) + `, m.id`
    de desempate. Comentar POR QUE o `CASE` no `ORDER BY` é seguro aqui (teto de 100, §7.9 não morde).
  - **`negocios_em_risco`:** os mesmos params novos repassados a `negocios_em_risco_de`; `tentativas`
    ao FIM; o `ORDER BY` do invólucro reflete a ordenação escolhida (ou confia na ordem que a interna
    já devolve — decidir e comentar).
  - **`dashboard_negocios_risco`:** params `p_data_de`/`p_data_ate` e o mesmo filtro de `data_pedido`
    no `WHERE` dos abertos. `RETURNS TABLE` inalterado.
  - **`pauta_do_dia_de`:** `tentativas` calculado igual, na CTE dos negócios; devolvido ao FIM do
    `RETURNS TABLE`; primeira chave do `ORDER BY` (e do `row_number`/da escolha do dia) vira
    `tentativas DESC`, antes de `e_meu`, `valor`, `dias_parado`, `id`. O `selo` continua saindo como
    hoje ("Orçamento parado"); o front troca o texto quando `tentativas > 0`.
  - **`pauta_do_dia`:** recriar com o `select *` da nova forma (herda `tentativas`).
  - **`pauta_resumo_destinatarios`:** `CREATE OR REPLACE` (assinatura igual) com a cláusula
    `AND u.id <> ALL( COALESCE((SELECT array(SELECT jsonb_array_elements_text(c.valor)::uuid) FROM configuracoes_automacao c WHERE c.empresa_id = u.empresa_id AND c.chave = 'pauta_resumo_excluidos'), '{}'::uuid[]) )`.
  - `DROP`+`CREATE` para as que mudam forma/assinatura; restaurar o `GRANT`/`REVOKE` EXATO de cada
    (conforme o Step 2), `negocios_em_risco_de` fechada a `authenticated`. `NOTIFY pgrst`. Tudo em
    `BEGIN/COMMIT`. Cabeçalho com a rota de volta (as definições do Step 2 + as permissões).

- [ ] **Step 4: Ensaiar** num `execute_sql` só (memória `ensaio-de-migration-em-producao`): sonda
  antes (as funções existem, md5 confere, índice em `historico_contatos(pedido_id)` existe), roda a
  migration sem `BEGIN/COMMIT` dentro de um bloco que ao fim dá `RAISE` para desfazer; conferir como
  `authenticated` de verdade (claims + `set_config('role','authenticated',true)`, §7.15) que:
  (a) a pauta ordena perseguido primeiro; (b) `negocios_em_risco` devolve `tentativas` e ordena pela
  coluna pedida; (c) o filtro de data recorta; (d) `negocios_em_risco_de` segue negada a
  `authenticated` (`insufficient_privilege`); (e) `pauta_resumo_destinatarios` exclui quem está na
  lista. Medir tempo (deve ficar < ~4 s).

- [ ] **Step 5: Mostrar o resultado do ensaio ao Lucas e pedir o "pode".** (GATE — não aplicar sem.)

- [ ] **Step 6: Aplicar** (`apply_migration`), conferir md5 no histórico e as permissões; renomear o
  arquivo para a versão que o banco registrou, se diferente. Commit da migration
  (`git commit --only -- supabase/migrations/<arquivo>`).

---

## Publicação (controlador, no fim — GATED)

1. Verificação §9 completa na base já com tudo junto.
2. Migration já aplicada (Task 9) ANTES do front.
3. Fotos das quatro telas mostradas ao Lucas (memória de servidor de cópia isolada com `cacheDir`
   próprio — `preview-le-launch-json-da-pasta-mae`).
4. Com o "pode": publicar SÓ os commits próprios, por cópia isolada (worktree + cherry-pick),
   `git fetch` antes, conferir que o `origin` não andou; conferir Vercel por SHA e o bundle no ar.

---

## Self-review (feito ao escrever)

- **Cobertura:** Parte 1 → Tasks 2,5,9; Parte 2 → Tasks 1,3,6,9; Parte 3 → Tasks 4,8,9; Parte 4 →
  Tasks 1,7,9. Contrato de tipos → Task 1. Sem lacuna.
- **Tipos consistentes:** `tentativas` é `int`/`number` em toda parte; `EtiquetaDeTentativa` recebe o
  nº de retomadas e mostra `+1`; `p_ordenar_por`/`p_ascendente` e `p_data_de`/`p_data_ate` iguais no
  contrato (Task 1) e na migration (Task 9).
- **Sem placeholders de lógica:** os pontos "decidir e comentar" (ORDER BY do invólucro; persistir
  ordenação no localStorage) são escolhas de implementação de baixo risco, não lógica omitida.
