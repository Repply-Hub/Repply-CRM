# Etapa 2 — A barra de filtros e o painel "No geral"

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o bloco "No geral" da tela "Hoje" ganha uma barra de filtros (etapa, fabricante e —
para gestor — responsável), passa a contar retorno marcado no cartão "Sem Próxima Ação", e ganha
os dois blocos que geram ação: resumo por fabricante com quantidade, e os 10 maiores parados.

**Arquitetura:** toda a conta continua na função de banco `dashboard_negocios_risco`, que já
aceita filtros de responsável, fabricante e funil — o navegador só não os usava. Acrescentamos
`p_etapas`, redefinimos "sem próxima ação" e devolvemos dois conjuntos novos dentro do mesmo
retorno. O estado dos filtros vive no **endereço da página**, não no armazenamento local.

**Tecnologias:** React 18 + TypeScript + Vite · TanStack Query · Supabase (Postgres, RLS) ·
Recharts · Vitest.

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit.
- **`npx tsc --noEmit -p tsconfig.app.json`** — com o `-p`. Linha de base **31 erros**; não pode subir.
- **`git push` PUBLICA em produção.** Rode a verificação ANTES de enviar.
- **Nunca `git add -A`.** Liste os arquivos; confira `git status --short` em comando separado.
- **Antes de começar:** `git fetch origin && git log --oneline HEAD..origin/main`.
- **Migration nova, nunca editar existente.** Tabela/função nova nasce com RLS e política no mesmo arquivo.
- **`src/integrations/supabase/types.ts` é gerado, mas atualizado à mão aqui** — o build não avisa quando diverge.
- **Sem filtro de período**, em lugar nenhum desta etapa. O painel é a foto de agora.
- **Depende da Etapa 1** ter sido publicada (o painel do negócio precisa abrir para os itens da lista serem clicáveis).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_risco_ganha_etapa_e_retorno_marcado.sql` | **Criar.** Recria a função de risco com `p_etapas`, a nova definição de "sem próxima ação" e os dois conjuntos novos |
| `src/lib/filtros-do-painel.ts` | **Criar.** Funções puras: ler os filtros do endereço e escrevê-los de volta. É o que fica testável |
| `src/lib/filtros-do-painel.test.ts` | **Criar.** Fixa o formato do endereço e o caso do filtro vazio |
| `src/components/pauta/BarraDeFiltros.tsx` | **Criar.** A barra em si: etapa, fabricante, responsável |
| `src/hooks/use-dashboard.ts` | **Modificar.** `useDashboardNegociosRisco` passa a mandar `p_etapas` e a devolver os dois conjuntos novos |
| `src/components/pauta/RadarDeRisco.tsx` | **Modificar.** Recebe os filtros, mostra quantidade ao lado do valor e ganha os dois blocos |
| `src/pages/Hoje.tsx` | **Modificar.** Guarda o estado dos filtros no endereço e o passa para a barra e para o painel |
| `src/integrations/supabase/types.ts` | **Modificar.** Declarar `p_etapas` e os campos novos do retorno |

---

## Tarefa 1 — A função de risco ganha etapa, retorno marcado e dois conjuntos novos

**Arquivos:**
- Criar: `supabase/migrations/20260905120000_risco_ganha_etapa_e_retorno_marcado.sql`
- Modificar: `src/integrations/supabase/types.ts:4625-4640`

**Interfaces:**
- Produz: `dashboard_negocios_risco(p_usuario_ids uuid[], p_fabricante_ids uuid[], p_funil_id uuid,
  p_dias_parado integer, p_etapas text[])`, devolvendo as 5 colunas de hoje mais
  `risco_por_fabricante` com `qtd`, e um `top_parados` novo.

🔴 **Acrescentar parâmetro NÃO é `create or replace`.** O Postgres identifica função por nome +
argumentos: um parâmetro a mais cria uma **sobrecarga**, e o PostgREST passa a ver duas funções
com o mesmo nome e recusa a chamada por ambiguidade. Tem que ser `DROP` seguido de `CREATE`.

Conferido antes de planejar: esta função tem permissão **padrão** (`PUBLIC` executa), ao contrário
de `pauta_do_dia_de`, que tem uma revogação a preservar. Aqui o `DROP` não apaga nada que precise
ser reemitido — mas confira de novo antes de aplicar, com o comando do Passo 4.

- [ ] **Passo 1: escrever a migration**

```sql
-- ============================================================================
-- O PAINEL DE RISCO GANHA ETAPA, CONTA O RETORNO MARCADO E DEVOLVE OS 10 MAIORES
-- ============================================================================
--
-- Três mudanças, todas medidas antes na MD Representações (05/09/2026):
--
-- 1. FILTRO POR ETAPA. A barra de filtros da tela "Hoje" precisa dele. Compara contra
--    `pedidos.status`, que JÁ é o slug da coluna do funil — juntar `kanban_colunas` só por causa
--    de um filtro opcional é a armadilha do CLAUDE.md §7.16, que já custou 11 segundos numa
--    função de agregação desta base.
--
-- 2. "SEM PRÓXIMA AÇÃO" PASSA A CONTAR O RETORNO MARCADO. Hoje o cartão significa "não existe
--    tarefa aberta ligada a este negócio", e NENHUM dos 146 negócios abertos da MD tem tarefa —
--    ele marca 146 de 146 e nunca vai sair de 100%. Ele não mede risco: mede um hábito que a
--    equipe não tem. Agora um negócio adiado pelo botão "Retomar depois" deixa de contar, e o
--    cartão vira o placar do hábito que se quer criar.
--
--    🔴 A comparação de data copia LITERALMENTE a de `pauta_do_dia_de` (`r.ate < v_hoje`, com
--    `v_hoje` sendo a data em São Paulo). Se as duas divergirem, a fila de cima e o cartão de
--    baixo discordam sobre o mesmo negócio no mesmo dia — e `proximo_contato_em` é gravado como
--    meia-noite, que em UTC é 21h do dia anterior em Natal.
--
-- 3. DOIS CONJUNTOS NOVOS no retorno: `qtd` ao lado do valor no resumo por fabricante (valor sem
--    contagem não diz se é um problema grande ou um negócio grande), e `top_parados`, a lista
--    dos 10 maiores parados — a única parte do painel interno da MD que gera ação direta.
--
-- 🔴 DROP + CREATE, e não `create or replace`: um parâmetro a mais cria SOBRECARGA, e o
-- PostgREST recusa a chamada por ambiguidade quando existem duas com o mesmo nome.
--
-- A função continua SEM `security definer` — ela respeita a regra de segurança de `pedidos`,
-- que já limita a leitura à empresa de quem chama. Não trocar isso por desempenho: medido, o
-- custo da regra é aceitável, e trocar tiraria a única cerca entre empresas desta consulta.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.dashboard_negocios_risco(uuid[], uuid[], uuid, integer);

CREATE FUNCTION public.dashboard_negocios_risco(
  p_usuario_ids    uuid[]  DEFAULT NULL,
  p_fabricante_ids uuid[]  DEFAULT NULL,
  p_funil_id       uuid    DEFAULT NULL,
  p_dias_parado    integer DEFAULT 7,
  p_etapas         text[]  DEFAULT NULL
)
RETURNS TABLE(
  qtd_parados bigint, valor_parados numeric,
  qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric,
  valor_risco_total numeric,
  risco_por_vendedor jsonb, risco_por_fabricante jsonb,
  top_parados jsonb
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.nome,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      -- LATERAL com ORDER BY created_at DESC LIMIT 1 casa direto com o índice
      -- idx_pedidos_historico_status_pedido_created (pedido_id, created_at DESC).
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      -- Sem tarefa aberta E sem retorno marcado para hoje ou depois.
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  )
  SELECT
    (SELECT count(*) FROM marcado WHERE parado)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado OR sem_proxima_acao)::numeric,
    -- A lista NOMINAL por responsável continua decidida no servidor. Na Etapa 3 o portão passa
    -- de papel para a chave de permissão; até lá, `is_gestor()` como sempre foi.
    CASE WHEN is_gestor() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    ),
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'nome', coalesce(nullif(trim(nome), ''), 'Negócio sem nome'),
               'fabrica', fabricante_nome, 'etapa', etapa_label,
               'responsavel', vendedor_nome, 'valor', valor_total,
               'dias_parado', (SELECT d FROM hoje) - parado_desde
             ) ORDER BY valor_total DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM marcado WHERE parado OR sem_proxima_acao
        ORDER BY valor_total DESC NULLS LAST LIMIT 10
      ) tp
    );
$function$;

COMMIT;

-- Confira depois de aplicar. A primeira devolve UMA linha (nunca duas — duas seria sobrecarga
-- não removida); a segunda mostra que o filtro de etapa recorta:
--
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='dashboard_negocios_risco';
--
--   select qtd_parados, qtd_sem_proxima_acao, jsonb_array_length(top_parados)
--     from public.dashboard_negocios_risco(null, null, null, 7, array['negociacao']);
```

- [ ] **Passo 2: declarar à mão em `types.ts`**

Em `src/integrations/supabase/types.ts:4626`, acrescentar `p_etapas?: string[]` a `Args` e
`top_parados: Json` a `Returns`. O build **não** avisa quando isto diverge — foi assim que uma
função de banco esquecida nos tipos passou despercebida em 23/08/2026.

- [ ] **Passo 3: conferir que o slug da etapa é mesmo o que `pedidos.status` guarda**

```sql
select distinct p.status, k.nome
  from public.pedidos p
  left join public.usuarios u on u.id = p.usuario_id
  left join public.kanban_colunas k on k.slug = p.status and k.empresa_id = u.empresa_id
 where p.status not in ('fechamento','perdido') limit 20;
```
Esperado: todo `status` casa com um `nome` de coluna. Se algum vier com `nome` nulo, a etapa
existe em `pedidos` e não em `kanban_colunas` — **pare e avise o Lucas** antes de aplicar: o
filtro esconderia esses negócios.

- [ ] **Passo 4: aplicar e conferir NO BANCO, não no arquivo**

Aplicar a migration. Depois:

```sql
select p.oid::regprocedure as assinatura,
       coalesce(array_to_string(p.proacl,' | '),'(padrao)') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='dashboard_negocios_risco';
```
Esperado: **uma** linha, com 5 argumentos, e a mesma permissão de antes. Duas linhas = sobrecarga,
e o PostgREST vai recusar — apague a antiga.

- [ ] **Passo 5: medir como usuário logado, não como administrador**

🔴 Pelo painel do Supabase você é administrador: sem regra de segurança e **sem tempo limite**. A
mesma consulta que mata a tela responde na hora para você (CLAUDE.md §7.15).

```sql
select set_config('request.jwt.claims','{"sub":"<user_id de um vendedor da MD>","role":"authenticated"}',true),
       set_config('role','authenticated',true),
       set_config('statement_timeout','8s',true);
explain (analyze, buffers)
  select * from public.dashboard_negocios_risco(null, null, null, 7, null);
```
Esperado: bem abaixo de 8 s. Anote o número — ele vai no commit.

- [ ] **Passo 6: commitar**

```bash
git status --short
git add supabase/migrations/20260905120000_risco_ganha_etapa_e_retorno_marcado.sql src/integrations/supabase/types.ts
git commit -m "feat(hoje): risco ganha filtro de etapa, conta retorno marcado e devolve os 10 maiores"
```

---

## Tarefa 2 — Os filtros vivem no endereço da página

**Arquivos:**
- Criar: `src/lib/filtros-do-painel.ts`
- Criar: `src/lib/filtros-do-painel.test.ts`

**Interfaces:**
- Produz: `type FiltrosDoPainel = { etapas: string[]; fabricantes: string[]; responsaveis: string[] }`,
  `lerFiltrosDoEndereco(params: URLSearchParams): FiltrosDoPainel` e
  `escreverFiltrosNoEndereco(params: URLSearchParams, filtros: FiltrosDoPainel): URLSearchParams`.

**Por que no endereço e não no armazenamento local:** sobrevive ao recarregar, dá para mandar por
link ("olha esses três fabricantes") e não fica preso a um navegador. O precedente de filtro
guardado no navegador existe na tela de Negócios (o funil) — e é justamente **um dos quatro
motivos** do defeito consertado na Etapa 1.

A tela de Negócios já guarda `vendedores`, `fabricantes` e etapas **no endereço**, com uma leitura
igual a esta (`Negocios.tsx:191`, `parseListParam`). Estamos seguindo o padrão que já existe, não
inventando um segundo — a diferença é que aqui ele fica testado.

- [ ] **Passo 1: escrever o teste primeiro**

`src/lib/filtros-do-painel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lerFiltrosDoEndereco, escreverFiltrosNoEndereco, type FiltrosDoPainel } from './filtros-do-painel';

const VAZIO: FiltrosDoPainel = { etapas: [], fabricantes: [], responsaveis: [] };

describe('filtros do painel no endereço', () => {
  it('endereço sem nada devolve tudo vazio', () => {
    expect(lerFiltrosDoEndereco(new URLSearchParams(''))).toEqual(VAZIO);
  });

  it('lê listas separadas por vírgula', () => {
    const p = new URLSearchParams('etapas=negociacao,proposta&fabricantes=abc');
    expect(lerFiltrosDoEndereco(p)).toEqual({
      etapas: ['negociacao', 'proposta'], fabricantes: ['abc'], responsaveis: [],
    });
  });

  // Um valor vazio entre vírgulas viraria um filtro por string vazia, que não casa com nada e
  // esvazia o painel sem explicação.
  it('descarta pedaço vazio', () => {
    expect(lerFiltrosDoEndereco(new URLSearchParams('etapas=,,negociacao,'))).toEqual({
      ...VAZIO, etapas: ['negociacao'],
    });
  });

  it('escrever tira do endereço o filtro que ficou vazio', () => {
    const antes = new URLSearchParams('etapas=negociacao&negocio=xyz');
    const depois = escreverFiltrosNoEndereco(antes, { ...VAZIO, fabricantes: ['abc'] });
    expect(depois.get('etapas')).toBeNull();
    expect(depois.get('fabricantes')).toBe('abc');
  });

  // O `?negocio=` é da Etapa 1 e abre a ficha do negócio. Escrever filtro não pode derrubá-lo.
  it('não mexe em parâmetro que não é dele', () => {
    const depois = escreverFiltrosNoEndereco(new URLSearchParams('negocio=xyz'), { ...VAZIO, etapas: ['a'] });
    expect(depois.get('negocio')).toBe('xyz');
  });

  it('ida e volta preserva o conteúdo', () => {
    const filtros: FiltrosDoPainel = { etapas: ['a', 'b'], fabricantes: ['c'], responsaveis: ['d'] };
    expect(lerFiltrosDoEndereco(escreverFiltrosNoEndereco(new URLSearchParams(''), filtros))).toEqual(filtros);
  });
});
```

- [ ] **Passo 2: rodar e ver FALHAR**

```bash
npx vitest run src/lib/filtros-do-painel.test.ts
```
Esperado: FALHA com "Failed to resolve import ./filtros-do-painel".

- [ ] **Passo 3: escrever a implementação mínima**

`src/lib/filtros-do-painel.ts`:

```ts
/**
 * Os filtros do painel "No geral" da tela "Hoje", guardados no ENDEREÇO da página.
 *
 * Endereço e não armazenamento local, de propósito: sobrevive ao recarregar, dá para mandar por
 * link, e não fica preso a um navegador. O precedente de filtro guardado no navegador está na
 * tela de Negócios, e é um dos quatro motivos do defeito do painel corrigido em 05/09/2026 —
 * a pessoa chegava pela pauta e caía num recorte que ela nunca escolheu.
 */
export interface FiltrosDoPainel {
  etapas: string[];       // slugs de kanban_colunas, que é o que `pedidos.status` guarda
  fabricantes: string[];  // ids
  responsaveis: string[]; // ids de usuarios.id
}

const CHAVES = ['etapas', 'fabricantes', 'responsaveis'] as const;

function lerLista(params: URLSearchParams, chave: string): string[] {
  return (params.get(chave) ?? '')
    .split(',')
    .map((p) => p.trim())
    // Pedaço vazio viraria filtro por texto vazio, que não casa com nada e esvazia o painel
    // sem explicação nenhuma na tela.
    .filter(Boolean);
}

export function lerFiltrosDoEndereco(params: URLSearchParams): FiltrosDoPainel {
  return {
    etapas: lerLista(params, 'etapas'),
    fabricantes: lerLista(params, 'fabricantes'),
    responsaveis: lerLista(params, 'responsaveis'),
  };
}

/** Devolve uma cópia — nunca altera o que recebeu, e preserva parâmetro de terceiros (`negocio`). */
export function escreverFiltrosNoEndereco(
  params: URLSearchParams,
  filtros: FiltrosDoPainel,
): URLSearchParams {
  const saida = new URLSearchParams(params);
  for (const chave of CHAVES) {
    const valores = filtros[chave];
    if (valores.length > 0) saida.set(chave, valores.join(','));
    else saida.delete(chave);
  }
  return saida;
}
```

- [ ] **Passo 4: rodar e ver PASSAR**

```bash
npx vitest run src/lib/filtros-do-painel.test.ts
```
Esperado: 6 testes passando.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add src/lib/filtros-do-painel.ts src/lib/filtros-do-painel.test.ts
git commit -m "feat(hoje): filtros do painel guardados no endereco da pagina"
```

---

## Tarefa 3 — A barra de filtros na tela

**Arquivos:**
- Criar: `src/components/pauta/BarraDeFiltros.tsx`
- Modificar: `src/pages/Hoje.tsx:113-132` (estado e cabeçalho) e `:196` (a chamada do painel)

**Interfaces:**
- Consome: `FiltrosDoPainel`, `lerFiltrosDoEndereco`, `escreverFiltrosNoEndereco` (Tarefa 2);
  `useKanbanColunas` de `@/hooks/use-kanban-colunas`; `useFabricantes` de `@/hooks/use-fabricantes`.
- Produz: `<BarraDeFiltros filtros onChange podeFiltrarPorResponsavel />`.

- [ ] **Passo 1: criar o componente**

`src/components/pauta/BarraDeFiltros.tsx`:

```tsx
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelectSearch } from '@/components/shared/MultiSelectSearch';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
// 🔴 Os dois vêm de `use-clientes`, não de arquivos com o nome deles. É de onde a tela de
// Negócios os importa (`Negocios.tsx:33`) — usar outro caminho criaria uma segunda lista.
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import type { FiltrosDoPainel } from '@/lib/filtros-do-painel';

/**
 * A barra de filtros do painel "No geral".
 *
 * O filtro de RESPONSÁVEL só aparece para quem pode ver a carteira dos colegas. Esconder o
 * controle não protege nada — quem decide é a regra do banco, e `dashboard_negocios_risco` já
 * devolve a lista nominal só para gestor. Aqui é só para não oferecer o que vai voltar vazio.
 *
 * Nenhum filtro de PERÍODO, e isso é deliberado: um negócio aberto criado há meses continua
 * sendo risco hoje. Recortar por data esconderia justamente os mais antigos parados, que são os
 * que mais importa achar — na MD os abertos mais antigos são de 2022.
 */
interface Props {
  filtros: FiltrosDoPainel;
  onChange: (filtros: FiltrosDoPainel) => void;
  podeFiltrarPorResponsavel: boolean;
}

export function BarraDeFiltros({ filtros, onChange, podeFiltrarPorResponsavel }: Props) {
  const { data: colunas } = useKanbanColunas();
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();

  const abertas = (colunas ?? []).filter((c) => !['fechamento', 'perdido'].includes(c.slug));
  const quantos = filtros.etapas.length + filtros.fabricantes.length + filtros.responsaveis.length;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <MultiSelectSearch
        placeholder="Etapa"
        options={abertas.map((c) => ({ value: c.slug, label: c.nome }))}
        value={filtros.etapas}
        onValueChange={(etapas) => onChange({ ...filtros, etapas })}
        className="w-[190px]"
      />
      <MultiSelectSearch
        placeholder="Fabricante"
        options={(fabricantes ?? []).map((f) => ({ value: f.id, label: f.nome }))}
        value={filtros.fabricantes}
        onValueChange={(fabricantes) => onChange({ ...filtros, fabricantes })}
        className="w-[190px]"
      />
      {podeFiltrarPorResponsavel && (
        <MultiSelectSearch
          placeholder="Responsável"
          options={(vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))}
          value={filtros.responsaveis}
          onValueChange={(responsaveis) => onChange({ ...filtros, responsaveis })}
          className="w-[190px]"
        />
      )}
      {quantos > 0 && (
        <>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {quantos} {quantos === 1 ? 'filtro' : 'filtros'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => onChange({ etapas: [], fabricantes: [], responsaveis: [] })}
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        </>
      )}
    </div>
  );
}
```

**Já conferido em 05/09/2026** — não invente nada novo, use exatamente estes:

| O que | Onde vive | Contrato |
|---|---|---|
| `MultiSelectSearch` | `src/components/shared/MultiSelectSearch.tsx` | `options: {value,label}[]`, `value: string[]`, `onValueChange`, `placeholder`, `className` |
| `useVendedores`, `useFabricantes` | `@/hooks/use-clientes` | — |
| `useKanbanColunas` | `@/hooks/use-kanban-colunas` | — |

Confirme que a forma de `useKanbanColunas` traz `slug` e `nome` antes de escrever:

```bash
grep -n "export function useKanbanColunas" -A 20 src/hooks/use-kanban-colunas.ts
```

- [ ] **Passo 2: ligar o estado em `Hoje.tsx`**

Em `src/pages/Hoje.tsx`, dentro do componente `Hoje`, acrescentar:

```tsx
  const [searchParams, setSearchParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltrosDoEndereco(searchParams), [searchParams]);
  const ehGestor = profile?.role === 'admin' || profile?.role === 'gestor' || profile?.role === 'empresa';

  function trocarFiltros(novos: FiltrosDoPainel) {
    setSearchParams((prev) => escreverFiltrosNoEndereco(new URLSearchParams(prev), novos), {
      replace: true,
    });
  }
```

E os imports: `useSearchParams` de `react-router-dom`, e os três símbolos de
`@/lib/filtros-do-painel`.

- [ ] **Passo 3: desenhar a barra dentro do "No geral"**

A barra pertence ao painel, não à fila. Passe tudo para o `RadarDeRisco`, que já é dono daquela
seção (`Hoje.tsx:196`):

```tsx
        <RadarDeRisco
          empresaId={empresaId}
          filtros={filtros}
          onChangeFiltros={trocarFiltros}
          podeFiltrarPorResponsavel={ehGestor}
        />
```

- [ ] **Passo 4: conferir**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npx vitest run && npx vite build
```
Esperado: `31`, testes passando, build compilando.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add src/components/pauta/BarraDeFiltros.tsx src/pages/Hoje.tsx
git commit -m "feat(hoje): barra de filtros de etapa, fabricante e responsavel"
```

---

## Tarefa 4 — O painel usa os filtros e ganha os dois blocos

**Arquivos:**
- Modificar: `src/hooks/use-dashboard.ts:174-204` (`useDashboardNegociosRisco`)
- Modificar: `src/components/pauta/RadarDeRisco.tsx`

**Interfaces:**
- Consome: `FiltrosDoPainel` (Tarefa 2); a função de banco com `p_etapas` e `top_parados` (Tarefa 1).
- Produz: `<RadarDeRisco empresaId filtros onChangeFiltros podeFiltrarPorResponsavel />`.

- [ ] **Passo 1: o hook passa a mandar `p_etapas` e a devolver o que é novo**

Em `src/hooks/use-dashboard.ts`, acrescentar `etapas?: string[]` ao tipo de `filters` (`:176`),
incluí-lo na `queryKey` (`:181`) e mandá-lo na chamada (`:184-188`):

```ts
        p_etapas: etapas && etapas.length > 0 ? etapas : null,
```

🔴 **Array vazio vira `null`, nunca `[]`.** `= ANY('{}')` não casa com nada — o painel voltaria
zerado em vez de "sem filtro" (CLAUDE.md §7.8). É a mesma conversão que os outros três filtros
já fazem duas linhas acima.

No tipo `DashboardNegociosRisco`, acrescentar `top_parados: TopParado[]`, e ao padrão de
`row ?? {...}` (`:191-199`) acrescentar `top_parados: []`. Declare também:

```ts
export interface TopParado {
  id: string; nome: string; fabrica: string | null; etapa: string;
  responsavel: string | null; valor: number; dias_parado: number;
}
```

E `qtd: number` nos tipos de `risco_por_vendedor` e `risco_por_fabricante`.

- [ ] **Passo 2: o componente aceita os filtros e desenha a barra**

Em `src/components/pauta/RadarDeRisco.tsx`, trocar a interface `Props` (`:79-81`) por:

```tsx
interface Props {
  empresaId?: string;
  filtros: FiltrosDoPainel;
  onChangeFiltros: (filtros: FiltrosDoPainel) => void;
  podeFiltrarPorResponsavel: boolean;
}
```

E a chamada do hook (`:84`):

```tsx
  const { data: bruto } = useDashboardNegociosRisco(empresaId, {
    etapas: filtros.etapas,
    fabricanteIds: filtros.fabricantes,
    usuarioIds: filtros.responsaveis,
  });
```

No `useMemo` que traduz o retorno (`:86-95`), acrescentar a linha que falta — sem ela
`risco.topParados` é indefinido e o bloco novo quebra na hora de renderizar:

```tsx
    topParados: bruto?.top_parados ?? [],
```

Desenhar `<BarraDeFiltros ... />` logo abaixo do `<header>` (`:112`).

- [ ] **Passo 3: quantidade ao lado do valor**

Nos três cartões, o valor hoje aparece sozinho. Acrescente a contagem no cartão "Valor em Risco",
que é o único que não a tem:

```tsx
                <span className="text-xs text-muted-foreground">
                  {risco.qtdParados + risco.qtdSemProximaAcao} negócios · parado ou sem próxima ação
                </span>
```

⚠️ Isso conta em dobro o negócio que é **as duas coisas**. Use o tamanho de `top_parados` só se
ele fosse a lista inteira — não é, tem teto de 10. Se a contagem exata importar, ela precisa vir
da função como uma coluna nova; **não some no navegador**. Por ora, troque o texto para
`"parado ou sem próxima ação"` sem número, e registre em `docs/divida-tecnica.md` que falta a
contagem distinta.

- [ ] **Passo 4: o bloco "Resumo por fabricante"**

Substituir o gráfico de pizza por uma **tabela**, que é o que o pessoal da MD de fato lê — e que
mostra quantidade e valor juntos, coisa que a pizza não faz:

```tsx
      <Card className="shadow-card border-border/60">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Factory className="h-4 w-4 text-[hsl(var(--warning))]" /> Resumo por fabricante
          </CardTitle>
          <CardDescription className="text-xs">Negócios em risco por marca representada</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 text-left font-semibold">Fabricante</th>
                  <th className="py-2 text-right font-semibold">Negócios</th>
                  <th className="py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {risco.riscoPorFabricante.map((f) => (
                  <tr key={f.fabrica} className="border-b border-border/50 last:border-0">
                    <td className="py-2">{f.fabrica}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{f.qtd}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
```

**Mantenha o gráfico de barras por responsável como está** — ele já existe, já é cortado no
servidor e não precisa mudar nesta etapa.

- [ ] **Passo 5: o bloco "Os 10 maiores parados"**

É a única parte que gera ação direta: cada linha leva ao negócio. Reusa o mesmo caminho que a
fila de cima usa, e que a Etapa 1 consertou.

```tsx
      <Card className="shadow-card border-border/60">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-bold">Os 10 maiores parados</CardTitle>
          <CardDescription className="text-xs">Clique para abrir o negócio</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 text-left font-semibold">Negócio</th>
                  <th className="py-2 text-left font-semibold">Fabricante</th>
                  <th className="py-2 text-left font-semibold">Responsável</th>
                  <th className="py-2 text-right font-semibold">Parado há</th>
                  <th className="py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {risco.topParados.map((n) => (
                  <tr
                    key={n.id}
                    className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50"
                    onClick={() => navigate(`/app?negocio=${n.id}`)}
                  >
                    <td className="py-2">{n.nome}</td>
                    <td className="py-2 text-muted-foreground">{n.fabrica ?? '—'}</td>
                    <td className="py-2 text-muted-foreground">{n.responsavel ?? '—'}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{n.dias_parado} dias</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(n.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
```

Acrescente `const navigate = useNavigate();` no topo do componente e o import de `react-router-dom`.

- [ ] **Passo 6: avisar que o cartão mudou de definição**

Um número que cai de 146 para 90 sem explicação parece defeito. No cartão "Sem Próxima Ação",
troque a legenda para:

```tsx
                <span className="text-xs text-muted-foreground">
                  Sem tarefa aberta e sem retorno marcado
                </span>
```

- [ ] **Passo 7: conferir e provar na tela**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npx vitest run && npx vite build
```
Esperado: `31`, testes passando, build compilando.

Na tela, logado como **vendedor comum**:
1. Marcar dois fabricantes. Os três cartões e as duas tabelas mudam **juntos**.
2. Copiar o endereço, abrir em outra aba. Os filtros vieram.
3. O filtro "Responsável" **não** aparece.
4. Clicar numa linha dos 10 maiores. A ficha do negócio abre (depende da Etapa 1).

Como **gestor**: o filtro "Responsável" aparece e recorta.

- [ ] **Passo 8: commitar**

```bash
git status --short
git add src/hooks/use-dashboard.ts src/components/pauta/RadarDeRisco.tsx
git commit -m "feat(hoje): painel usa os filtros, mostra quantidade e lista os 10 maiores parados"
```

---

## Verificação da etapa

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31
npx vitest run                                                      # tudo passando
npx vite build                                                      # compila
```

**No banco, depois de aplicar a migration:**

```sql
select qtd_parados, qtd_sem_proxima_acao, jsonb_array_length(top_parados) as top
  from public.dashboard_negocios_risco(null, null, null, 7, null);
```
Esperado para a MD: `qtd_sem_proxima_acao` **abaixo de 146** só depois que alguém usar "Retomar
depois" — antes disso continua 146, e isso está certo.

**Depois de publicar**, prove que chegou (CLAUDE.md §16): baixe o pedaço da tela "Hoje" que está
no ar e procure a frase `Os 10 maiores parados` dentro dele.

---

## O que esta etapa NÃO faz

- Não cria permissão. O filtro de responsável aparece por **papel** (gestor), como já era. Na
  Etapa 3 o portão passa a ser a chave.
- Não amplia a pauta de cima — ela continua sendo só os negócios da própria pessoa.
- Não mexe no e-mail das 7h.
- Não exporta CSV nem acrescenta gráfico novo. Ficou de fora por YAGNI; se o pessoal pedir depois
  de usar, entra com pedido na mão.
