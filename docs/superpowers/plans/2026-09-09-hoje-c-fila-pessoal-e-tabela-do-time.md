# Plano C — A fila vira pessoal, a tabela vira o time

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa.

**Objetivo:** a fila da tela "Hoje" passa a mostrar só os negócios da própria pessoa — para todo
mundo, gestor ou não —, e a chave `pauta_de_todos` deixa de ampliar a fila para passar a liberar
uma **tabela do time**: todos os negócios que pedem atenção, 10 por vez, com "Abrir negócio" e
"Retomar depois" em cada linha.

**Arquitetura:** a fila é uma consulta que já existe (`pauta_do_dia_de`) e só perde uma cláusula.
A tabela sai de dentro de `dashboard_negocios_risco` — onde vive hoje como `top_parados`, presa
em 10 linhas — e vira função própria com paginação, para que "Ver mais" não recalcule os
agregados nem os dois gráficos a cada clique.

**Pilha:** Postgres (funções `SECURITY DEFINER` e não-definer, RLS) · React 18 + TypeScript ·
TanStack Query v5 · shadcn/Radix · Vitest.

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit (CLAUDE.md §5).
- **Linha de base da verificação** (CLAUDE.md §9): `npx tsc --noEmit -p tsconfig.app.json` → **31**
  (o `-p` é obrigatório); `npm run test` → **1140+** verdes; `npm run build` compila; `eslint` sem
  erro novo.
- 🔴 **QUEM APLICA MIGRATION EM PRODUÇÃO É O CONTROLADOR, NÃO VOCÊ.** Você **escreve** o arquivo
  em `supabase/migrations/`. Você **pode** ler o banco com `execute_sql` (SELECT) — e deve, para
  colher o texto vigente das funções. Você **não pode** `apply_migration`, DDL, INSERT, UPDATE ou
  DELETE, nem dentro de transação com rollback.
- **Como nomear a migration:** `AAAAMMDDHHMMSS_nome_curto.sql`, com o carimbo **maior** que o do
  último arquivo da pasta. Descubra o último com `ls supabase/migrations/ | tail -3` e escolha o
  carimbo seguinte (por exemplo, se o último for `20260907150000`, use `20260909120000`).
  A ordem do nome é a ordem de aplicação — a Tarefa 2 depende da Tarefa 1 ter rodado.
  🔴 **Nunca edite migration já aplicada** (CLAUDE.md §6.3); só acrescente arquivo novo.
- 🔴 **`CREATE OR REPLACE`, nunca `DROP`, em `pauta_do_dia_de(uuid)`.** Ela teve `authenticated`
  revogado de propósito — é só do servidor e alimenta o e-mail das 7h. Um `DROP` apagaria a
  revogação em silêncio e devolveria a pauta de qualquer colega a qualquer pessoa logada.
  Confira antes e depois:
  ```sql
  select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'pauta_do_dia%';
  ```
  Esperado, nas duas medições: `pauta_do_dia_de(uuid) -> postgres=X/postgres | service_role=X/postgres`.
- 🔴 **Colha o corpo vigente com `pg_get_functiondef` e EDITE esse texto.** Nunca reescreva de
  memória. A revisão de 07/09/2026 provou a fidelidade da última reescrita por `md5(prosrc)`;
  faça o mesmo e diga o hash no relatório.
- 🔴 **Array vazio em filtro de RPC filtra tudo fora** (CLAUDE.md §7.8): `= ANY('{}')` não casa
  com nada. Converta `[]` em `null` **antes** de mandar.
- 🔴 **`usuarios.id` ≠ `usuarios.user_id`** (CLAUDE.md §4.5). Errar não dá erro visível.
- 🔴 **Meça desempenho como usuário logado, nunca como administrador no painel** (CLAUDE.md
  §7.15) — lá não há RLS nem tempo limite, e você mediria outra coisa.
- **Git:** `git status --short` num comando separado antes de commitar; outra sessão do Claude
  usa esta pasta. Nunca `git add -A`. `git commit -m "<msg>" --only -- <caminhos>`. Termine com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Sem `git push`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<data>_fila_pessoal.sql` **(novo)** | `pauta_do_dia_de` deixa de ampliar pela chave |
| `supabase/migrations/<data>_negocios_em_risco.sql` **(novo)** | A função paginada da tabela, e `dashboard_negocios_risco` perde o `top_parados` |
| `src/hooks/use-dashboard.ts` | Ganha `useNegociosEmRisco`; `useDashboardNegociosRisco` perde `top_parados` |
| `src/components/pauta/TabelaDoTime.tsx` **(novo)** | A tabela com "Ver mais" e as ações por linha |
| `src/components/pauta/RadarDeRisco.tsx` | Passa a montar `TabelaDoTime` no lugar do bloco dos 10 |
| `src/pages/Hoje.tsx` | Perde a etiqueta de dono na fila |

---

## Tarefa 1: a fila volta a ser pessoal

**Arquivos:**
- Criar: `supabase/migrations/<AAAAMMDDHHMMSS>_fila_pessoal.sql`
- Modificar: `src/pages/Hoje.tsx` (o bloco da etiqueta, ~linhas 82–90)

**Interfaces:**
- Produz: `pauta_do_dia_de(uuid)` com a mesma assinatura de hoje, sem a ampliação pela chave.

- [ ] **Passo 1: colher o corpo vigente**

```sql
select md5(prosrc) as impressao, prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='pauta_do_dia_de';
```

Guarde a impressão digital no relatório. Ela prova depois que você mudou só o que devia.

- [ ] **Passo 2: escrever a migration**

Edite o texto colhido, mudando **duas** coisas e nada mais:

1. Apague a linha `v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);` e a declaração
   `v_ve_todos boolean` do bloco `declare`.
2. Na CTE `gente`, troque `and (v_ve_todos or u.id = p_usuario_id)` por `and u.id = p_usuario_id`.

Cabeçalho do arquivo, em comentário, dizendo o porquê:

```sql
-- ============================================================================
-- A FILA DA TELA "HOJE" VOLTA A SER SEMPRE PESSOAL
-- ============================================================================
--
-- Decisão do dono do produto (09/09/2026): a fila mostra só os próprios negócios, para todo
-- mundo. A chave `pauta_de_todos` deixa de ampliar a fila e passa a liberar a TABELA DO TIME,
-- que é o que este trabalho constrói em seguida.
--
-- Três coisas que isto resolve de graça:
--   · O e-mail das 7h volta a ser pessoal. As duas decisões de redação que estavam na mesa do
--     dono do produto ("N coisas esperam você" e "R$ X em jogo" somando a equipe) deixam de
--     existir.
--   · O gestor parava de ver os PRÓPRIOS negócios: o teto de 7 era disputado por valor com os
--     da equipe inteira, e o negócio de R$ 8 mil do gestor perdia a vaga para o de R$ 2 milhões
--     de um colega.
--   · Quem adia negócio alheio passa a fazê-lo pela tabela, deliberadamente, e não por tropeço
--     numa fila que misturava tudo.
--
-- 🔴 CREATE OR REPLACE, NUNCA DROP. Esta função teve `authenticated` revogado de propósito
-- (é só do servidor, alimenta o e-mail das 7h) e um DROP apagaria isso em silêncio.
--
-- A coluna `responsavel` FICA no retorno, mesmo passando a vir sempre nula: é a mesma coluna que
-- o e-mail lê, e o dia em que a fila voltar a ter item de outra pessoa ela volta a servir.
-- ============================================================================
```

- [ ] **Passo 3: provar por simulação, sem aplicar**

Você não aplica. Reescreva a consulta como SELECT puro e rode como a Fabiola
(`usuarios.id` `fb5cb820-63e0-452e-9536-788d0ed55146`, login
`41ccd5c5-6b9e-4f82-af96-b7e52d92d1a4`) e como a Érika (`aa4b1d0f-fe58-4a9f-89a5-ce5ae2993c1e`,
login `93ef1364-318b-4e9e-8412-ce3ab902f32a`).

Esperado, medido em 08/09/2026 antes da mudança: a Fabiola tem **7 itens, os 7 de colegas**
(ela tem 0 negócios próprios). Depois: **0 itens de colega**. A Érika: sem mudança nenhuma.

Escreva no relatório os dois números, antes e depois, para cada uma.

- [ ] **Passo 4: a tela perde a etiqueta**

Em `src/pages/Hoje.tsx`, dentro de `ItemPauta`, apague o bloco que desenha
`{item.responsavel && ( … )}` — com a fila pessoal ele nunca mais aparece.

Deixe **um comentário de uma linha** explicando que o campo continua existindo no banco e por
quê, para o próximo leitor não achar que é lixo:

```tsx
        {/* A fila é sempre pessoal desde 09/09/2026, então `item.responsavel` vem sempre nulo e
            a etiqueta de dono saiu daqui. O campo fica no banco: é o que a tabela do time e o
            e-mail leem. */}
```

- [ ] **Passo 5: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git add supabase/migrations/<o arquivo novo>.sql
git commit -m "feat(hoje): a fila volta a ser sempre pessoal, e a chave passa a liberar a tabela

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/<o arquivo novo>.sql src/pages/Hoje.tsx
```

---

## Tarefa 2: a função paginada da tabela

**Arquivos:**
- Criar: `supabase/migrations/<AAAAMMDDHHMMSS>_negocios_em_risco.sql`

**Interfaces:**
- Produz:
  ```sql
  public.negocios_em_risco(
    p_usuario_ids    uuid[] default null,
    p_fabricante_ids uuid[] default null,
    p_funil_id       uuid   default null,
    p_dias_parado    int    default 7,
    p_etapas         text[] default null,
    p_limite         int    default 10,
    p_deslocamento   int    default 0
  ) returns table (
    id uuid, nome text, fabrica text, etapa text, responsavel text,
    valor numeric, dias_parado int, total_geral bigint
  )
  ```
  `total_geral` repete em toda linha o total do recorte — é como o "Ver mais" sabe quando parar,
  sem uma segunda chamada.

- [ ] **Passo 1: colher o corpo vigente de `dashboard_negocios_risco`**

```sql
select md5(prosrc), prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='dashboard_negocios_risco';
select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='dashboard_negocios_risco';
```

Guarde os dois no relatório.

- [ ] **Passo 2: escrever a função nova**

Reaproveite as CTEs `hoje`, `abertos` e `marcado` **exatamente** como estão na função vigente —
inclusive a junção de `kanban_colunas` com as **três** colunas (`slug`, `empresa_id`, `funil_id`;
sem `funil_id` uma empresa com dois funis dobra cada negócio) e o `LEFT JOIN LATERAL` da última
atividade. Depois:

```sql
CREATE OR REPLACE FUNCTION public.negocios_em_risco(
  p_usuario_ids uuid[] DEFAULT NULL, p_fabricante_ids uuid[] DEFAULT NULL,
  p_funil_id uuid DEFAULT NULL, p_dias_parado integer DEFAULT 7,
  p_etapas text[] DEFAULT NULL, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0
) RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text,
                valor numeric, dias_parado integer, total_geral bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH hoje AS (...), abertos AS (...), marcado AS (...),
  meus AS (
    -- O MESMO portão de `top_parados`: quem tem a chave vê a empresa, quem não tem vê os seus.
    -- `eu_vejo_pauta_de_todos()` é avaliado UMA vez (InitPlan), não por linha — a RLS de
    -- `pedidos` cobra função por linha varrida e já matou uma consulta desta base (§7.16).
    SELECT * FROM marcado
     WHERE (parado OR sem_proxima_acao)
       AND ((SELECT public.eu_vejo_pauta_de_todos())
            OR usuario_id = (SELECT public.get_my_usuario_id()))
  )
  SELECT m.id,
         coalesce(nullif(trim(m.nome),''),
                  nullif(trim(m.campos_extras ->> 'Negócio'),''),
                  nullif(trim(cl.empresa),'') || coalesce(' | ' || m.fabricante_nome,''),
                  'Negócio sem nome'),
         m.fabricante_nome, m.etapa_label, m.vendedor_nome, m.valor_total,
         ((SELECT d FROM hoje) - m.parado_desde)::integer,
         count(*) OVER ()::bigint
    FROM meus m
    LEFT JOIN public.clientes cl ON cl.id = m.cliente_id
   ORDER BY m.valor_total DESC NULLS LAST
   OFFSET greatest(p_deslocamento, 0)
   LIMIT greatest(least(p_limite, 100), 1);
$function$;

REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) TO authenticated;
```

🔴 **`count(*) OVER ()` conta as linhas de `meus`, não da página** — é isso que faz `total_geral`
dizer o total do recorte mesmo com `LIMIT`. Confirme com uma medição: chame com
`p_limite := 10, p_deslocamento := 0` e confira que `total_geral` bate com um `count(*)` da mesma
condição sem paginação.

🔴 **O teto de `p_limite` em 100 não é decoração:** sem ele, um "Ver mais" com número absurdo
varreria a base inteira sob RLS e estouraria o tempo limite de 8 segundos (CLAUDE.md §7.15), e a
tela giraria para sempre em vez de dar erro.

🔴 **A junção com `clientes` fica DEPOIS do recorte, nunca antes.** A política de `clientes` chama
função por linha; juntar antes do `LIMIT` paga isso 12 mil vezes. Foi exatamente o conserto da
Etapa 2 (`20260905123000`).

- [ ] **Passo 3: tirar o `top_parados` de `dashboard_negocios_risco`**

⚠️ Mudar a lista de colunas do `RETURNS TABLE` **não** cabe em `CREATE OR REPLACE` — o Postgres
recusa com *"cannot change return type of existing function"*. Aqui é `DROP` + `CREATE`, e o
`DROP` **apaga as concessões**. Meça a `proacl` antes (Passo 1), reponha depois e meça de novo.

```sql
DROP FUNCTION IF EXISTS public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]);
-- CREATE ... (o mesmo texto de hoje, sem a última coluna do SELECT e sem `top_parados` no
-- RETURNS TABLE)
GRANT EXECUTE ON FUNCTION public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]) TO anon, authenticated, service_role;
```

Confira que a `proacl` depois é **igual** à de antes. Se não for, a migration está errada.

- [ ] **Passo 4: medir o custo, como usuário logado**

Custo do painel medido em 08/09/2026: **29,0 ms** quente, como usuário logado. Meça de novo,
depois da mudança, com o método do CLAUDE.md §7.15:

```sql
select set_config('request.jwt.claims','{"sub":"<login>","role":"authenticated"}',true),
       set_config('role','authenticated',true),
       set_config('statement_timeout','8s',true);
explain (analyze, buffers) select * from public.negocios_em_risco(null,null,null,7,null,10,0);
```

Se `negocios_em_risco` passar de ~50 ms quente, **pare e avise o controlador** em vez de commitar.
E confirme no plano de execução que o portão aparece como `InitPlan … rows=1 loops=1`, e não uma
vez por linha.

- [ ] **Passo 5: declarar em `types.ts` e commitar**

Acrescente `negocios_em_risco` ao bloco `Functions` de `src/integrations/supabase/types.ts`, com
os tipos exatos, e tire `top_parados` do retorno de `dashboard_negocios_risco`. **O build não
avisa quando falta** (CLAUDE.md §6.8).

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
git status --short
git add supabase/migrations/<o arquivo novo>.sql
git commit -m "feat(hoje): a tabela do time vira funcao propria, paginada e com o total do recorte

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/<o arquivo novo>.sql src/integrations/supabase/types.ts
```

---

## Tarefa 3: a tabela na tela, com "Ver mais"

**Arquivos:**
- Criar: `src/components/pauta/TabelaDoTime.tsx`
- Modificar: `src/hooks/use-dashboard.ts` (novo hook; `DashboardNegociosRisco` perde `top_parados`)
- Modificar: `src/components/pauta/RadarDeRisco.tsx` (monta a tabela nova no lugar do bloco dos 10)

**Interfaces:**
- Consome: `negocios_em_risco` (Tarefa 2); `PainelDoNegocio` e `useNegocioNoEndereco` (Plano A).
- Produz:
  ```ts
  export function useNegociosEmRisco(
    empresaId: string | undefined,
    filtros: { usuarioIds?: string[]; fabricanteIds?: string[]; funilId?: string; diasParado?: number; etapas?: string[] },
    quantos: number,
  ): UseQueryResult<{ linhas: NegocioEmRisco[]; total: number }>;
  ```

- [ ] **Passo 1: o hook**

Em `src/hooks/use-dashboard.ts`, ao lado de `useDashboardNegociosRisco`, declare primeiro o tipo
de uma linha — ele espelha, coluna por coluna, o `RETURNS TABLE` da Tarefa 2:

```ts
// Uma linha da tabela do time. Espelha `negocios_em_risco` (migration de 09/09/2026).
// `total_geral` repete em toda linha o total do RECORTE, não da página: é assim que o
// "Ver mais" sabe quando parar, sem uma segunda consulta.
export type NegocioEmRisco = {
  id: string;
  nome: string;
  fabrica: string | null;
  etapa: string | null;
  responsavel: string | null;
  valor: number | null;
  dias_parado: number | null;
  total_geral: number;
};
```

Depois o hook, seguindo **o mesmo padrão** de `useDashboardNegociosRisco` — inclusive a conversão
de array vazio em `null`, que já está comentada lá (§7.8):

```ts
export function useNegociosEmRisco(
  empresaId: string | undefined,
  filtros: { usuarioIds?: string[]; fabricanteIds?: string[]; funilId?: string; diasParado?: number; etapas?: string[] },
  quantos: number,
) {
  const { usuarioIds, fabricanteIds, funilId, diasParado = 7, etapas } = filtros;
  return useQuery({
    // `quantos` entra na chave: cada "Ver mais" é uma consulta nova, e a anterior fica em cache.
    queryKey: ['negocios_em_risco', empresaId, usuarioIds, fabricanteIds, funilId, diasParado, etapas, quantos],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('negocios_em_risco', {
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_funil_id: funilId ?? null,
        p_dias_parado: diasParado,
        p_etapas: etapas && etapas.length > 0 ? etapas : null,
        p_limite: quantos,
        p_deslocamento: 0,
      });
      if (error) throw error;
      const linhas = (data ?? []) as NegocioEmRisco[];
      return { linhas, total: Number(linhas[0]?.total_geral ?? 0) };
    },
    enabled: !!empresaId,
  });
}
```

⚠️ **Repare que "Ver mais" cresce o `LIMIT` em vez de andar com o `OFFSET`.** É de propósito: com
`OFFSET` a tela precisa costurar páginas e lidar com linha que se move entre elas enquanto alguém
edita um negócio. Crescer o limite devolve sempre a lista inteira até ali, ordenada igual.
Por isso o teto de 100 na função importa.

- [ ] **Passo 2: a tabela**

Crie `src/components/pauta/TabelaDoTime.tsx`. Ela recebe os filtros e as duas ações, guarda
`quantos` em estado (começando em 10) e desenha:

- as colunas **Negócio · Fabricante · Etapa · Responsável · Valor · Sem mexer há · (ações)**;
- a coluna **Responsável só quando `podeVerDeTodos` for verdadeiro** — sem a chave ela repetiria
  o próprio nome em toda linha;
- por linha, dois botões: **Abrir negócio** (chama `onAbrir(id)`) e **Retomar depois** (chama
  `onRetomar(linha)`);
- embaixo, **"Ver mais"**, escondido quando `linhas.length >= total`, com o texto dizendo onde a
  pessoa está: `Ver mais (mostrando 10 de 145)`.

🔴 **Mexer em qualquer filtro volta `quantos` para 10.** Sem isso a pessoa abre 60 linhas, estreita
o filtro e dispara uma consulta de 60 linhas sobre um recorte que ela acabou de encolher. Use um
`useEffect` que observa os filtros e reinicia — e comente o porquê.

🔴 **A tabela rola na horizontal dentro dela mesma** (`overflow-x: auto`), nunca a página. São
sete colunas; em notebook 1366×768 elas não cabem, e o projeto já tem tela que prende o usuário
por transbordo (CLAUDE.md §7.11).

- [ ] **Passo 3: `RadarDeRisco` monta a tabela**

Troque o bloco "Os 10 maiores em risco" por `<TabelaDoTime … />`, passando os filtros que o
componente já tem e `podeVerDeTodos={podeFiltrarPorResponsavel}`.

`onAbrir` é `abrirNegocio` do `useNegocioNoEndereco` (Plano A, Tarefa 2). `onRetomar` abre o
**mesmo** `DialogoRetorno` que a fila usa — não faça um segundo diálogo. Se ele estiver montado
só em `Hoje.tsx`, suba o estado para lá e passe a função por propriedade.

Tire `top_parados` de `DashboardNegociosRisco` em `use-dashboard.ts` e do que a tela lê.

- [ ] **Passo 4: provar no navegador**

Com `preview_start`. Não peça ao Lucas para conferir à mão.

1. Como gestor: a tabela mostra 10 linhas e o rodapé diz `Ver mais (mostrando 10 de 145)`.
2. Clicar em "Ver mais" → 20 linhas, o texto acompanha.
3. Marcar um filtro de etapa → volta para 10 e o total muda.
4. "Abrir negócio" numa linha → o painel abre sobre a tela.
5. "Retomar depois" numa linha → abre o mesmo diálogo da fila.
6. Como vendedor sem a chave: a coluna Responsável não aparece, e as linhas são só dele.
7. `read_console_messages` → sem erro.

- [ ] **Passo 5: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git add src/components/pauta/TabelaDoTime.tsx
git commit -m "feat(hoje): a tabela do time ganha acao por linha e Ver mais de 10 em 10

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/TabelaDoTime.tsx src/components/pauta/RadarDeRisco.tsx src/hooks/use-dashboard.ts
```

---

## Como se prova que o plano C funcionou

| | Prova |
|---|---|
| A fila é pessoal | A Fabiola passa de **7 itens, 7 de colegas** para **0 de colegas**; a Érika não muda |
| A revogação sobreviveu | `pauta_do_dia_de(uuid)` continua `postgres | service_role`, sem `authenticated` |
| A concessão do painel voltou | `proacl` de `dashboard_negocios_risco` idêntica antes e depois do DROP |
| A tabela pagina | 10 → "Ver mais" → 20; filtro reinicia em 10; total confere com um `count(*)` independente |
| A chave manda | Vendedor sem a chave vê só os próprios e sem a coluna Responsável |
| Não ficou lento | `negocios_em_risco` abaixo de ~50 ms quente, medido **como usuário logado** |

## O que este plano NÃO faz

- Não cria a tarefa automática do "Retomar depois" — isso é o Plano D.
- Não mexe na voz da tela nem do e-mail — isso é o Plano B.
- Não mexe nos três cartões do topo, que continuam mostrando o total da empresa para todo mundo
  (§7 da especificação, decisão em aberto).
- Não aplica nada em produção e não publica.
