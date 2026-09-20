# "Pede atenção" = sem próxima ação — Plano de Implementação

> **Para quem executa:** este plano é de UMA migration de banco (duas funções recriadas). Não há
> teste de vitest — a verificação é o **ensaio em produção** (transação que termina em `RAISE`,
> memória `ensaio-de-migration-em-producao`). Passos com `- [ ]`.

**Goal:** Fazer o "No geral" e a tabela do time contarem só negócios **sem próxima ação** — um
negócio com "Retomar depois" agendado pra frente, ou tarefa com prazo não vencido, sai de "pedem
atenção" até a data e volta sozinho.

**Architecture:** `CREATE OR REPLACE` das funções `dashboard_negocios_risco` e
`negocios_em_risco_de` — **mesma assinatura** (preserva as concessões, sem `DROP`). Só mudam a
definição de `sem_proxima_acao` (passa a olhar o prazo da tarefa) e os `WHERE`/`count`/`sum` (o
ramo `parado` deixa de entrar sozinho). Sem mudança de front.

**Tech Stack:** Postgres (funções `LANGUAGE sql`), Supabase Management API via
`npx supabase db query --linked --project-ref hukeirrmsoiowvvrhivx -f <arquivo>`.

## Global Constraints (de CLAUDE.md e do desenho)

- Nunca editar migration existente — só acrescentar arquivo novo (CLAUDE.md §6.3).
- Nenhum dado real (nome/valor/id) no arquivo (§6.9); medir e relatar número na conversa.
- `dashboard_negocios_risco` fica aberta a `anon`/`authenticated`/`service_role`;
  `negocios_em_risco_de` fica FECHADA (só `service_role`). `CREATE OR REPLACE` com a mesma
  assinatura preserva isso.
- Aplicar em produção pede ensaio + "pode" do Lucas (memória `escrita-em-producao...`).
- Versão da migration = a hora da aplicação (`AAAAMMDDHHMMSS`); conferir que não colide com o
  `origin` antes (memória `versao-de-migration-pode-colidir`).

## File Structure

- **Criar:** `supabase/migrations/<versão>_pede_atencao_sem_proxima_acao.sql` — recria as duas
  funções, dentro de `BEGIN; ... COMMIT;`. É o único arquivo de código.
- **Sem** mudança em `src/` nem em `types.ts` (as funções devolvem os mesmos campos).

---

### Task 1: Escrever a migration

**Files:**
- Create: `supabase/migrations/<versão>_pede_atencao_sem_proxima_acao.sql`

**Interfaces:**
- Consome: as definições VIVAS de `dashboard_negocios_risco()` e
  `negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer, date, date, text, boolean)`
  (colher com `pg_get_functiondef` antes de editar — não redigitar 12 KB à mão).
- Produz: as mesmas duas funções, com três mudanças cirúrgicas (abaixo).

- [ ] **Passo 1: Colher as definições vivas** para um arquivo, com
  `select p.proname, pg_get_functiondef(p.oid) ... where proname in (...)` via
  `db query ... --output-format json`, e gravar cada `def` num `.sql` (memória
  `ensaio-de-migration-em-producao`, seção 15/09).

- [ ] **Passo 2: Mudança 1 — `sem_proxima_acao` (nas DUAS funções, idêntico).** A checagem da
  tarefa passa a exigir prazo não vencido:

  DE:
  ```sql
  NOT EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.pedido_id = a.id AND t.status <> 'concluida'
  )
  ```
  PARA:
  ```sql
  NOT EXISTS (
    SELECT 1 FROM public.tarefas t, hoje
    WHERE t.pedido_id = a.id AND t.status <> 'concluida'
      AND t.prazo_final IS NOT NULL
      AND (t.prazo_final AT TIME ZONE 'America/Sao_Paulo')::date >= hoje.d
  )
  ```
  (a segunda perna, do `historico_contatos ... proximo_contato_em >= hoje.d`, fica igual.)

- [ ] **Passo 3: Mudança 2 — `dashboard_negocios_risco`, o SELECT final:**
  ```sql
  -- qtd_parados / valor_parados: era WHERE parado
  (SELECT count(*) FROM marcado WHERE parado AND sem_proxima_acao)::bigint,
  (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado AND sem_proxima_acao)::numeric,
  -- qtd_sem_proxima_acao / valor_sem_proxima_acao: SEM mudança (WHERE sem_proxima_acao)
  ...
  -- valor_risco_total: era WHERE parado OR sem_proxima_acao
  (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
  -- risco_por_vendedor e risco_por_fabricante: filtro era (parado OR sem_proxima_acao)
  ... FROM marcado WHERE sem_proxima_acao AND vendedor_nome IS NOT NULL ...
  ... FROM marcado WHERE sem_proxima_acao AND fabricante_nome IS NOT NULL ...
  ```

- [ ] **Passo 4: Mudança 3 — `negocios_em_risco_de`, a CTE `meus`:**
  ```sql
  meus AS (
    SELECT * FROM marcado
    WHERE sem_proxima_acao
      AND (
        (SELECT public.ve_pauta_de_todos(p_usuario_id))
        OR usuario_id = p_usuario_id
      )
  )
  ```
  (era `WHERE (parado OR sem_proxima_acao) AND (...)`.)

- [ ] **Passo 5: Envelopar** as duas em `BEGIN;` … `COMMIT;`, com cabeçalho explicando a decisão e
  o rollback (as defs antigas ficam guardadas no scratchpad). Sem `DROP`, sem `REVOKE/GRANT` (a
  assinatura não muda; `CREATE OR REPLACE` preserva o ACL).

- [ ] **Passo 6: Conferir sintaxe sem banco** com `pglast` (pega erro de SQL e `$$` aninhado):
  `python -c "import pglast; pglast.parse_sql(open('<arquivo>').read())"` → sem exceção.

---

### Task 2: Ensaiar em produção (a "prova" desta migration)

**Gated:** só com o "pode ensaiar" do Lucas (o ensaio prende as tabelas por segundos; perguntar o
horário).

- [ ] **Passo 1: Medir ANTES** (empresa-âncora), guardando os números na conversa (não no arquivo):
  `qtd_parados`, `qtd_sem_proxima_acao`, `valor_risco_total`, e o `total` de `negocios_em_risco_de`.

- [ ] **Passo 2: Ensaio num `db query -f`** com: `set local statement_timeout='5s'` +
  `set local lock_timeout` + a migration inteira (as duas funções) + as medições DEPOIS +
  um `do $$ begin raise exception 'ENSAIO %', <json com os números>; end $$;` no fim.
  Rodar como `authenticated` de verdade (claims de um gestor da MD) para provar RLS/privilégio.

- [ ] **Passo 3: Conferir no JSON do erro** que:
  - negócio com retorno agendado / tarefa com prazo futuro **saiu** de "pede atenção";
  - o negócio com tarefa **vencida** **voltou** a contar;
  - `total` novo == `qtd_sem_proxima_acao`;
  - o RAISE desfez tudo (`select to_regprocedure` e `pg_get_functiondef` seguem os ANTIGOS —
    conferir que nada ficou).

- [ ] **Passo 4: Mostrar os números ao Lucas** (antes → depois) e pedir o "pode aplicar".

---

### Task 3: Aplicar em produção

**Gated:** só com o "pode aplicar" do Lucas.

- [ ] **Passo 1: Escolher a versão** `AAAAMMDDHHMMSS` (hora da aplicação) e conferir que não colide
  com `origin` (`git -C <worktree> fetch` + olhar `supabase/migrations` do origin).

- [ ] **Passo 2: Aplicar** com `db query -f <arquivo>` (o `BEGIN;…COMMIT;` dentro é atômico).

- [ ] **Passo 3: Registrar** em `supabase_migrations.schema_migrations(version,name,statements)` à
  mão (a aplicação por `db query` não grava sozinha), com `version` = a do arquivo.

- [ ] **Passo 4: Verificar no ar** — `pg_get_functiondef` das duas bate com o arquivo; ACLs certas
  (`has_function_privilege`); os números novos conferem (medir de novo).

---

### Task 4: Publicar o arquivo (git)

**Gated:** só com o "pode publicar" do Lucas. O `git push` publica o **site**, mas a migration já
foi aplicada no banco no Task 3 — aqui é só versionar o arquivo e o desenho.

- [ ] **Passo 1: `git fetch origin`** e conferir que `origin/main` não anda por cima de nada meu;
  rebase da minha branch sobre o tip atual se preciso.

- [ ] **Passo 2: Commitar** o arquivo da migration (o desenho já está no commit `0e0d739e`):
  `git add supabase/migrations/<versão>_pede_atencao_sem_proxima_acao.sql` + commit convencional.

- [ ] **Passo 3: `git push origin HEAD:main`** (só os meus commits) e conferir o SHA na Vercel.

---

## Self-Review

- **Cobertura do desenho:** ✅ as três mudanças (sem_proxima_acao com prazo; dashboard cards/valor;
  tabela `meus`) cobrem cada linha da seção "O que muda". A pauta e o front ficam intocados (o
  desenho diz isso). O "tarefa sem prazo" (0 negócio) é consequência da Mudança 1 (exige
  `prazo_final IS NOT NULL`), coerente com o desenho.
- **Placeholders:** nenhum — cada mudança tem o SQL exato.
- **Consistência de tipos:** as assinaturas e os `RETURNS TABLE` não mudam; por isso `CREATE OR
  REPLACE` sem `DROP` e sem mexer em `types.ts`.
