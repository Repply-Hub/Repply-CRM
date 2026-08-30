# Cerco do bloqueio de plano — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o bloqueio de plano cobrir tudo que uma empresa inadimplente pode escrever, e
virar regra que se aplica sozinha a tabela nova.

**Architecture:** Uma lista de exceções em SQL como fonte única da verdade; uma função geradora
que percorre as tabelas e cria as políticas restritivas que faltam; uma rotina diária que a
chama; e um teste de vitest que quebra o build quando alguém cria tabela fora do cerco. As 8
funções `SECURITY DEFINER` que furam a RLS ganham checagem no corpo.

**Tech Stack:** Postgres 15 (Supabase), `pg_cron`, Vitest.

## Global Constraints

- **Etapa 1 de 6** do desenho aprovado em
  `docs/superpowers/specs/2026-08-29-cobranca-bloqueio-e-exclusao-design.md`. Ler §6 antes.
- **Nunca editar migration existente** (CLAUDE.md §6.3). Só acrescentar arquivo novo.
- **Toda política nova é `AS RESTRICTIVE`** e envolve a chamada em `(SELECT ...)` — o `SELECT`
  não é estilo: faz o planner avaliar **uma vez por comando** em vez de uma vez por linha.
  Medido: 1,7 ms por comando, mesmo varrendo 60.188 linhas.
- **Linhas de base que não podem subir:** tipos `35` (`npx tsc --noEmit -p tsconfig.app.json`),
  lint `456` (`npm run lint`). Testes hoje: `667` em 39 arquivos.
- **Migration escrita ≠ migration aplicada.** Este ambiente não tem banco local; aplicar é um
  gesto separado e precisa de autorização do Lucas.
- **PT-BR** em código, comentário, teste e commit.
- **Não commitar sem o "pode" do Lucas** (CLAUDE.md §13). `git push` publica.

---

## 🔴 GATE HUMANO ANTES DA TAREFA 2

A Tarefa 1 cria a lista de exceções. **Ela contém decisões de produto que o Lucas precisa
aprovar antes de qualquer tabela ser trancada.** Sete estão no desenho aprovado; **catorze são
classificação minha** e estão marcadas abaixo.

Não executar a Tarefa 2 sem o aval dele.

### Ficam FORA do cerco — decisão já aprovada pelo Lucas (§6.1 do desenho)

| Tabela | Por quê |
|---|---|
| `usuarios` | sem isso a empresa não arruma o próprio cadastro para conseguir pagar |
| `empresas` | idem |
| `notificacoes` | fechar aviso é preferência de tela, não protege receita |
| `notificacoes_leituras` | marcar como lido |
| `chat_mensagens_leituras` | marcar como lido |
| `whatsapp_conversa_visualizacoes` | marcar como lido |
| `sidebar_preferences` | preferência de tela |
| `empresa_assinaturas` | é a linha da assinatura; já é somente leitura para o cliente, e travá-la impediria de pagar |

### Ficam FORA do cerco — ⚠️ CLASSIFICAÇÃO MINHA, precisa do aval

| Tabela | Por que eu classifiquei assim |
|---|---|
| `app_erros` | é onde o app relata erro. Travar perde a telemetria **justamente de quem está bloqueado** — cegaria a gente no pior momento |
| `automation_logs` | log escrito pelo sistema, não pela pessoa |
| `audit_permissoes` | auditoria escrita por gatilho; travar quebra o gatilho |
| `historico_alteracoes` | idem — auditoria por gatilho |
| `debug_logs` | log técnico, 0 linhas hoje |
| `licencas_natal` | raspagem de portal público, compartilhada entre todos |
| `licencas_idema` | idem |
| `licencas_extremoz` | idem |
| `secao_presets` | catálogo compartilhado — `empresas` tem chave estrangeira **apontando para** ele |
| `secao_preset_itens` | idem |
| `gmail_tokens` | ligado ao login, não à empresa |
| `user_domains` | idem |
| `user_integrations` | idem |
| `perfis_customizados` | **não tem coluna de empresa nenhuma.** É vazamento de multi-tenancy que virou catálogo por acidente (1 linha: "Líder comercial", da MD). Travar não conserta; precisa de conserto próprio, fora desta etapa |

### Entram no cerco: as 40 restantes

`chat_geral_config`, `chat_grupo_membros`, `chat_grupos`, `chat_mensagens`,
`colunas_customizadas`, `configuracoes_automacao`, `configuracoes_campos`,
`configuracoes_campos_etapas`, `configuracoes_tabelas`, `configuracoes_wapi`,
`email_conta_usuarios`, `email_mensagens`, `email_rascunhos`, `emails`, `emails_recebidos`,
`eventos`, `fabricante_arquivos`, `fabricantes`, `funis`, `historico_contatos`,
`itens_pedido`, `kanban_colunas`, `linhas_ignoradas_importacao`, `marcadores`,
`marcadores_obras`, `mensagens_whatsapp`, `metas_vendas`, `pedidos_comentarios`,
`permissao_presets`, `permissoes_usuario`, `plano_vendas_fabricante_ordem`, `secao_excecoes`,
`sidebar_empresa_padrao`, `sidebar_empresa_padrao_historico`, `tarefas`,
`tarefas_kanban_colunas`, `whatsapp_contatos_fotos`, `whatsapp_conversa_responsaveis`,
`whatsapp_conversas`, `whatsapp_mensagens`

Mais o **DELETE** nas 5 que já têm INSERT/UPDATE: `clientes`, `contatos`, `obra_contatos`,
`obras`, `pedidos`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260830100000_lista_de_excecoes_do_gate.sql` | **Criar** — a lista de exceções como função, fonte única da verdade |
| `supabase/migrations/20260830100500_gerador_do_gate_de_plano.sql` | **Criar** — a função que percorre e aplica |
| `supabase/migrations/20260830101000_aplica_o_gate_e_agenda.sql` | **Criar** — roda o gerador uma vez e agenda a rotina diária |
| `supabase/migrations/20260830101500_gate_no_delete_das_cinco.sql` | **Criar** — fecha o DELETE das 5 já gateadas |
| `supabase/migrations/20260830102000_gate_nas_funcoes_que_furam.sql` | **Criar** — checagem nas 7 funções `SECURITY DEFINER` |
| `src/test/gate-de-plano.test.ts` | **Criar** — o teste que quebra o build |
| `docs/arquitetura/permissoes-e-rls.md` | **Modificar** (~linha 204-213) — o checklist passa a citar o gate |

---

### Task 1: A lista de exceções, como fonte única da verdade

**Files:**
- Create: `supabase/migrations/20260830100000_lista_de_excecoes_do_gate.sql`

**Interfaces:**
- Produces: `public.tabelas_fora_do_gate() RETURNS text[]` — usada pela Tarefa 2 (gerador) e
  pela Tarefa 6 (teste).

- [ ] **Step 1: Escrever a migration**

```sql
-- As tabelas que NÃO entram no bloqueio por falta de pagamento.
--
-- 🔴 UMA LISTA SÓ, consultada pelo gerador (20260830100500) E pelo teste que quebra o build
-- (src/test/gate-de-plano.test.ts). Duas listas divergiriam em semanas — foi o que aconteceu
-- com a cópia manual do gate para `obra_contatos` em 27/08/2026, que saiu pela metade.
--
-- Cada nome aqui é uma decisão, não um esquecimento. Ver o plano em
-- docs/superpowers/plans/2026-08-29-cerco-do-bloqueio-de-plano.md
create or replace function public.tabelas_fora_do_gate()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- ── Sem isto o cliente não consegue nos PAGAR ────────────────────────────
    'usuarios',
    'empresas',
    'empresa_assinaturas',

    -- ── Leitura disfarçada de escrita: marcar como lido ──────────────────────
    'notificacoes_leituras',
    'chat_mensagens_leituras',
    'whatsapp_conversa_visualizacoes',

    -- ── Preferência de tela: travar irrita e não protege receita ─────────────
    'notificacoes',
    'sidebar_preferences',

    -- ── Log e auditoria: escritos pelo SISTEMA, não pela pessoa ──────────────
    -- 🔴 `app_erros` é onde o app relata erro. Travar perde a telemetria
    -- justamente de quem está bloqueado — cegaria a gente no pior momento.
    -- As de auditoria são escritas por gatilho; travar quebra o gatilho.
    'app_erros',
    'automation_logs',
    'audit_permissoes',
    'historico_alteracoes',
    'debug_logs',

    -- ── Catálogo compartilhado entre TODAS as empresas ───────────────────────
    -- `empresas` tem chave estrangeira APONTANDO PARA `secao_presets`: ele é
    -- referenciado pelas empresas, não pertence a nenhuma.
    'secao_presets',
    'secao_preset_itens',

    -- ── Raspagem de portal público, comum a todo mundo ───────────────────────
    'licencas_natal',
    'licencas_idema',
    'licencas_extremoz',

    -- ── Ligadas ao LOGIN, não à empresa ──────────────────────────────────────
    'gmail_tokens',
    'user_domains',
    'user_integrations',

    -- ── 🔴 Sem coluna de empresa NENHUMA ─────────────────────────────────────
    -- `perfis_customizados` tem 1 linha ("Líder comercial", criada pela gestora
    -- da MD em 02/07/2026) e RLS que deixa qualquer gestor de qualquer empresa
    -- escrever numa lista que todos enxergam. É vazamento de multi-tenancy que
    -- virou catálogo por acidente. Travar por plano não conserta nada; o
    -- conserto é outro e está fora desta etapa.
    'perfis_customizados'
  ]::text[];
$$;

comment on function public.tabelas_fora_do_gate() is
  'Tabelas que NÃO entram no bloqueio por falta de pagamento. Fonte única, lida pelo gerador e pelo teste.';

revoke all on function public.tabelas_fora_do_gate() from public, anon;
-- Só `service_role`. Não há chamador que precise de `authenticated`: quem consome é
-- `aplicar_gate_de_plano()` (que é SECURITY DEFINER e roda como service_role), e o teste do
-- build, que lê o TEXTO deste arquivo e nunca toca o banco. Conceder a mais é privilégio sem
-- chamador — mesmo padrão de `empresa_tem_secao_de` e `pauta_do_dia_de`.
grant execute on function public.tabelas_fora_do_gate() to service_role;
```

- [ ] **Step 2: Conferir que a lista tem exatamente 22 nomes e nenhum repetido**

Rodar no banco (leitura, não altera nada):

```sql
select cardinality(public.tabelas_fora_do_gate())                          as total,
       cardinality(array(select distinct unnest(public.tabelas_fora_do_gate()))) as distintos;
```

Esperado: `total = 22`, `distintos = 22`.

- [ ] **Step 3: Conferir que todo nome da lista existe de verdade**

Nome errado na lista viraria tabela trancada por engano, em silêncio.

```sql
select t as nome_que_nao_existe
from unnest(public.tabelas_fora_do_gate()) t
where to_regclass('public.' || quote_ident(t)) is null;
```

Esperado: **0 linhas**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830100000_lista_de_excecoes_do_gate.sql
git commit -m "feat(cobranca): lista de excecoes do bloqueio, como fonte unica"
```

---

### Task 2: O gerador que aplica o cerco

**Files:**
- Create: `supabase/migrations/20260830100500_gerador_do_gate_de_plano.sql`

**Interfaces:**
- Consumes: `public.tabelas_fora_do_gate()` (Tarefa 1); `public.empresa_plano_ativo()` (já existe).
- Produces: `public.aplicar_gate_de_plano() RETURNS TABLE(tabela text, politica text, acao text)`
  — usada pela Tarefa 3 (aplicação + agendamento).

- [ ] **Step 1: Escrever a migration**

```sql
-- Aplica o bloqueio por falta de pagamento em toda tabela do inquilino que ainda não o tenha.
--
-- 🔴 POR QUE UM GERADOR, E NÃO UMA LISTA ESCRITA À MÃO.
-- O gate nasceu em 20260803140402 cobrindo 5 tabelas. Em 27/08/2026 ele foi copiado à mão
-- para `obra_contatos` e SAIU PELA METADE — só INSERT, sem UPDATE. Quatro semanas depois de
-- existir. Lista que alguém mantém falha; rotina que confere, não.
--
-- 🔴 O `(SELECT ...)` EM VOLTA DA CHAMADA NÃO É ESTILO. Ele faz o planner tratar o resultado
-- como InitPlan e avaliar UMA VEZ POR COMANDO, em vez de uma vez por linha. Medido nesta base:
-- 1,7 ms por comando, mesmo varrendo 60.188 linhas. Sem o SELECT, isto viraria a armadilha do
-- CLAUDE.md §7.9, que já transformou 4 ms em 16 segundos noutra função.
--
-- Idempotente de propósito: pode rodar todo dia sem efeito colateral. Política que já existe é
-- pulada, e não recriada — recriar tomaria trava exclusiva na tabela sem necessidade.
create or replace function public.aplicar_gate_de_plano()
returns table (tabela text, politica text, acao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_tabela record;
  v_fora   text[] := public.tabelas_fora_do_gate();
  v_cmd    text;
  v_nome   text;
  v_existe boolean;
begin
  for r_tabela in
    select c.relname::text as nome
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Só tabela com RLS ligada. Sem RLS, política nenhuma é avaliada e criar uma daria
      -- falsa sensação de proteção.
      and c.relrowsecurity
      and not (c.relname = any (v_fora))
      -- Só tabela que de fato aceita escrita de usuário logado. Tabela que só o servidor
      -- escreve não precisa de gate — e criar um ali só adiciona ruído.
      --
      -- 🔴 `public` CONTA COMO USUÁRIO LOGADO, e esquecer isso custou caro no ensaio de
      -- 29/08/2026: a primeira versão desta consulta procurava só `authenticated` e deixou
      -- 10 tabelas de fora — entre elas `whatsapp_mensagens` (60 mil linhas) e
      -- `whatsapp_conversas`, o módulo inteiro que o bloqueio existe para travar.
      --
      -- No Postgres, política concedida a `public` vale para TODOS os papéis, o que inclui
      -- `authenticated`. Metade das políticas antigas deste projeto foi escrita sem o `TO`
      -- explícito, e o Postgres gravou `{public}` — então filtrar por `authenticated` só
      -- enxerga as políticas mais novas.
      and exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
          and (('authenticated' = any (p.roles)) or ('public' = any (p.roles)))
      )
    order by c.relname
  loop
    foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE']
    loop
      v_nome := r_tabela.nome || '_exige_plano_' || lower(v_cmd);

      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = r_tabela.nome and policyname = v_nome
      ) into v_existe;

      if v_existe then
        tabela := r_tabela.nome; politica := v_nome; acao := 'ja existia';
        return next;
        continue;
      end if;

      -- INSERT usa WITH CHECK (a linha ainda não existe); UPDATE e DELETE usam USING.
      if v_cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated
             with check ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome);
      else
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated
             using ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome, v_cmd);
      end if;

      tabela := r_tabela.nome; politica := v_nome; acao := 'criada';
      return next;
    end loop;
  end loop;
end;
$$;

comment on function public.aplicar_gate_de_plano() is
  'Cria as politicas restritivas de bloqueio por falta de pagamento nas tabelas que ainda nao as tem. Idempotente.';

revoke all on function public.aplicar_gate_de_plano() from public, anon, authenticated;
grant execute on function public.aplicar_gate_de_plano() to service_role;
```

- [ ] **Step 2: Ensaiar SEM aplicar, numa transação desfeita**

🔴 Antes de trancar 40 tabelas em produção, ver a lista do que ela faria.

```sql
begin;
select tabela, politica, acao from public.aplicar_gate_de_plano() order by tabela, politica;
rollback;
```

Esperado: **120 linhas** com `acao = 'criada'` (40 tabelas × 3 comandos), e **nenhuma** tabela
da lista de exceções aparecendo. Conferir nome a nome contra a lista das 40 no topo deste plano.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260830100500_gerador_do_gate_de_plano.sql
git commit -m "feat(cobranca): gerador que aplica o bloqueio nas tabelas sem gate"
```

---

### Task 3: Aplicar o cerco e agendar a conferência diária

**Files:**
- Create: `supabase/migrations/20260830101000_aplica_o_gate_e_agenda.sql`

**Interfaces:**
- Consumes: `public.aplicar_gate_de_plano()` (Tarefa 2).

- [ ] **Step 1: Escrever a migration**

```sql
-- Roda o gerador uma vez (fecha o cerco hoje) e agenda a conferência diária.
--
-- A rotina existe para a tabela criada AMANHÃ: ela nasce sem gate, e às 3h20 da manhã seguinte
-- passa a ter. O teste de vitest (src/test/gate-de-plano.test.ts) avisa antes disso, no build —
-- as duas camadas se cobrem: o teste pega cedo, a rotina não depende de ninguém lembrar.
--
-- Horário escolhido para não colidir com as faxinas já agendadas (3h10, 3h20 e 3h40 estão
-- ocupadas por outras rotinas; 3h50 está livre).
select public.aplicar_gate_de_plano();

select cron.schedule(
  'gate-de-plano-conferencia-diaria',
  '50 3 * * *',
  $$ select public.aplicar_gate_de_plano() $$
);
```

- [ ] **Step 2: Conferir que o cerco fechou**

```sql
with grava as (
  select distinct tablename from pg_policies
  where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
    and 'authenticated' = any(roles)
),
com_gate as (
  select distinct tablename from pg_policies
  where schemaname='public'
    and (coalesce(qual,'') like '%empresa_plano_ativo%'
      or coalesce(with_check,'') like '%empresa_plano_ativo%')
)
select g.tablename as tabela_gravavel_sem_gate
from grava g
left join com_gate cg on cg.tablename = g.tablename
where cg.tablename is null
  and not (g.tablename = any (public.tabelas_fora_do_gate()))
order by 1;
```

Esperado: **0 linhas**.

- [ ] **Step 3: Conferir que a rotina foi agendada**

```sql
select jobname, schedule, active from cron.job where jobname = 'gate-de-plano-conferencia-diaria';
```

Esperado: 1 linha, `schedule = '50 3 * * *'`, `active = true`.

- [ ] **Step 4: Medir o custo antes e depois, numa consulta pesada**

🔴 Prometi ao Lucas que isto não deixa o sistema lento. Provar, não afirmar.

```sql
explain (analyze, buffers)
update public.whatsapp_mensagens set lida = lida where id = (select id from public.whatsapp_mensagens limit 1);
```

Esperado: o filtro do plano aparece como `InitPlan` / `One-Time Filter`, **não** como
`SubPlan` avaliado por linha. Anotar o tempo total e comparar com a medição anterior (1,7 ms).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260830101000_aplica_o_gate_e_agenda.sql
git commit -m "feat(cobranca): fecha o cerco do bloqueio e agenda a conferencia diaria"
```

---

### Task 4: Fechar o DELETE nas cinco tabelas já gateadas

**Files:**
- Create: `supabase/migrations/20260830101500_gate_no_delete_das_cinco.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Fecha o DELETE em clientes, contatos, obra_contatos, obras e pedidos.
--
-- 🔴 ISTO INVERTE UMA DECISÃO ESCRITA E JUSTIFICADA, e a inversão precisa ficar registrada.
-- A migration 20260803140402_gate_plano_escrita.sql:19-22 diz, com todas as letras:
--   "DELETE também fica livre: impedir alguém de apagar os próprios dados não protege receita
--    nenhuma."
-- O Lucas decidiu o contrário em 29/08/2026: bloqueado passa a ser SÓ VER.
--
-- A razão dele é de retenção, não de receita: se o bloqueio existe para segurar o cliente até
-- ele pagar, deixá-lo apagar a própria carteira nesse meio-tempo trabalha contra — ele pode ir
-- embora deixando terra arrasada, e aí não há o que reter.
--
-- Estas 5 não passam pelo gerador porque ele só cria política que ainda não existe, e as de
-- INSERT/UPDATE delas já existem. O DELETE é o que faltava.
do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'contatos', 'obra_contatos', 'obras', 'pedidos']
  loop
    execute format(
      'drop policy if exists %I on public.%I', t || '_exige_plano_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using ((select public.empresa_plano_ativo()))',
      t || '_exige_plano_delete', t);
  end loop;
end $$;
```

- [ ] **Step 2: Conferir que as 5 têm os três comandos**

```sql
select tablename, string_agg(cmd, ', ' order by cmd) as comandos
from pg_policies
where schemaname='public'
  and policyname like '%_exige_plano_%'
  and tablename in ('clientes','contatos','obra_contatos','obras','pedidos')
group by tablename order by tablename;
```

Esperado: 5 linhas, todas com `DELETE, INSERT, UPDATE`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260830101500_gate_no_delete_das_cinco.sql
git commit -m "feat(cobranca): bloqueado nao apaga mais os proprios dados"
```

---

### Task 5: As funções que furam a RLS

**Files:**
- Create: `supabase/migrations/20260830102000_gate_nas_funcoes_que_furam.sql`

**Interfaces:**
- Consumes: `public.empresa_plano_ativo()` (já existe).

- [ ] **Step 1: Ler o corpo atual das 7 funções antes de reescrever**

🔴 `CREATE OR REPLACE` exige o corpo inteiro. Reescrever de memória apaga o que estiver lá.

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in (
  'criar_funil','delete_obras_bulk','liberar_envio_de_catalogo',
  'reservar_envio_de_catalogo','restaurar_usuario_por_email',
  'set_whatsapp_assinar_remetente_global','wa_iniciar_conversa'
) order by p.proname;
```

- [ ] **Step 2: Escrever a migration, acrescentando a MESMA guarda em cada uma**

Para cada função, inserir logo depois do `BEGIN` (e depois da checagem de papel que já existir):

```sql
  if not public.empresa_plano_ativo() then
    raise exception 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      using errcode = '42501';
  end if;
```

🔴 **`delete_current_user` fica de fora de propósito.** Apagar a própria conta tem de continuar
funcionando com a empresa bloqueada — impedir alguém de sair do sistema porque a empresa dele
não pagou é problema de LGPD, não de cobrança.

🔴 `set_whatsapp_assinar_remetente_global` só é alcançável por `is_admin()` desde
`20260829120000`, e o admin é isento do gate por construção (`empresa_plano_ativo()` termina em
`OR public.is_admin()`). A guarda ali é redundante hoje — **acrescentar mesmo assim**, para a
função não virar porta se a permissão dela mudar um dia.

- [ ] **Step 3: Conferir que as 7 passaram a citar o gate**

```sql
select p.proname,
       pg_get_functiondef(p.oid) like '%empresa_plano_ativo%' as tem_guarda
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in (
  'criar_funil','delete_obras_bulk','liberar_envio_de_catalogo',
  'reservar_envio_de_catalogo','restaurar_usuario_por_email',
  'set_whatsapp_assinar_remetente_global','wa_iniciar_conversa'
) order by p.proname;
```

Esperado: 7 linhas, todas `tem_guarda = true`.

- [ ] **Step 4: Conferir que `delete_obras_bulk` NÃO perdeu o filtro de empresa**

Ela foi corrigida em `20260829120000`; reescrevê-la é a chance de desfazer isso sem querer.

```sql
select pg_get_functiondef(oid) like '%usuario_in_my_empresa%' as ainda_tem_filtro
from pg_proc where proname = 'delete_obras_bulk';
```

Esperado: `true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260830102000_gate_nas_funcoes_que_furam.sql
git commit -m "feat(cobranca): as funcoes que furam a RLS passam a checar o plano"
```

---

### Task 6: O teste que quebra o build

**Files:**
- Create: `src/test/gate-de-plano.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toda tabela nova nasce dentro do cerco do bloqueio por falta de pagamento.
 *
 * 🔴 POR QUE ESTE TESTE EXISTE. O gate nasceu em 03/08/2026 cobrindo 5 tabelas. Em 27/08 ele
 * foi copiado à mão para `obra_contatos` e SAIU PELA METADE — só INSERT, sem UPDATE. Quatro
 * semanas depois de existir. E o checklist oficial de tabela nova nem o mencionava.
 *
 * A rotina diária no banco conserta isso sozinha, mas só na madrugada seguinte. Este teste
 * avisa ANTES, no build, apontando arquivo e linha — que é quando ainda é barato.
 *
 * Ele lê os ARQUIVOS de migration de propósito: não há banco local neste ambiente
 * (CLAUDE.md §6.8), então conferir no banco não é uma opção aqui.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * As excecoes, LIDAS DO PROPRIO SQL — nunca redigitadas aqui.
 *
 * 🔴 Uma copia desta lista em TypeScript seria o mesmo defeito que este teste existe para
 * impedir: duas listas que divergem em semanas. Entao o teste le o array de
 * `public.tabelas_fora_do_gate()` direto da migration que o define. Acrescentou um nome la?
 * O teste passa a respeita-lo sem ninguem tocar neste arquivo.
 *
 * Se a migration sumir ou mudar de forma, isto QUEBRA em vez de assumir lista vazia — lista
 * vazia faria toda excecao virar violacao, e o build ficaria vermelho sem explicacao.
 */
export function lerExcecoes(conteudoDaMigration: string): Set<string> {
  const corpo = /tabelas_fora_do_gate[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/i
    .exec(conteudoDaMigration);
  if (!corpo) {
    throw new Error(
      'Nao achei o array de tabelas_fora_do_gate() na migration. ' +
        'Se a funcao mudou de forma, ajuste lerExcecoes() — nao desative o teste.',
    );
  }
  return new Set([...corpo[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

interface TabelaNova {
  nome: string;
  arquivo: string;
  linha: number;
}

/**
 * As tabelas criadas por migration, com onde foram criadas.
 *
 * Aceita `create table` com ou sem `if not exists`, e ignora schema que não seja `public`.
 */
export function tabelasCriadas(arquivos: { nome: string; conteudo: string }[]): TabelaNova[] {
  const achadas: TabelaNova[] = [];
  const padrao = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/i;

  for (const arq of arquivos) {
    const linhas = arq.conteudo.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      const m = padrao.exec(linhas[i]);
      if (m) achadas.push({ nome: m[1], arquivo: arq.nome, linha: i + 1 });
    }
  }
  return achadas;
}

/** A tabela é citada em alguma política que exige plano, em qualquer migration? */
export function temGate(tabela: string, todoOConteudo: string): boolean {
  return new RegExp(`${tabela}_exige_plano_`, 'i').test(todoOConteudo);
}

describe('cerco do bloqueio por falta de pagamento', () => {
  const arquivos = readdirSync(MIGRATIONS)
    .filter((n) => n.endsWith('.sql'))
    .map((nome) => ({ nome, conteudo: readFileSync(join(MIGRATIONS, nome), 'utf-8') }));

  const tudo = arquivos.map((a) => a.conteudo).join('\n');

  const migrationDaLista = arquivos.find((a) => a.nome.includes('lista_de_excecoes_do_gate'));
  if (!migrationDaLista) throw new Error('A migration da lista de excecoes nao existe.');
  const EXCECOES = lerExcecoes(migrationDaLista.conteudo);

  it('reconhece uma tabela criada por migration', () => {
    const achadas = tabelasCriadas([
      { nome: 'x.sql', conteudo: 'create table if not exists public.minha_coisa (\n  id uuid\n);' },
    ]);
    expect(achadas).toEqual([{ nome: 'minha_coisa', arquivo: 'x.sql', linha: 1 }]);
  });

  it('le as excecoes do SQL, em vez de duplica-las aqui', () => {
    const sql = "tabelas_fora_do_gate() ... select array['usuarios', 'app_erros']::text[];";
    expect(lerExcecoes(sql)).toEqual(new Set(['usuarios', 'app_erros']));
  });

  it('🔴 quebra se a migration mudar de forma, em vez de assumir lista vazia', () => {
    expect(() => lerExcecoes('create function outra_coisa()')).toThrow(/tabelas_fora_do_gate/);
  });

  it('reconhece que uma tabela tem gate', () => {
    expect(temGate('pedidos', 'create policy pedidos_exige_plano_insert on ...')).toBe(true);
    expect(temGate('pedidos', 'create policy pedidos_select on ...')).toBe(false);
  });

  it('🔴 nenhuma tabela do inquilino está fora do cerco', () => {
    const foraDoCerco = tabelasCriadas(arquivos)
      .filter((t) => !EXCECOES.has(t.nome))
      .filter((t) => !temGate(t.nome, tudo))
      .map((t) => `${t.nome}  (criada em ${t.arquivo}:${t.linha})`);

    // A mensagem diz o nome da tabela e onde ela nasceu: quem quebrar isto conserta sem caçar.
    // Para deixar uma tabela de fora de propósito, acrescente o nome APENAS em
    // `public.tabelas_fora_do_gate()` — as duas listas têm de andar juntas.
    expect([...new Set(foraDoCerco)]).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/gate-de-plano.test.ts`
Expected: FAIL no terceiro teste, listando as tabelas ainda sem gate (as migrations das
Tarefas 3–5 ainda não existem no momento em que este teste é escrito, se seguido em ordem).

- [ ] **Step 3: Rodar depois das Tarefas 3, 4 e 5 aplicadas**

Run: `npx vitest run src/test/gate-de-plano.test.ts`
Expected: PASS, 5 testes.

> Se ainda falhar apontando tabela legítima do inquilino, a Tarefa 3 não a cobriu — investigar
> por que o gerador a pulou (provavelmente RLS desligada ou sem política para `authenticated`).

- [ ] **Step 4: Conferir que a suíte inteira não regrediu**

Run: `npx vitest run`
Expected: `672 passed` (667 de antes + 5 deste arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/test/gate-de-plano.test.ts
git commit -m "test(cobranca): quebra o build quando nasce tabela fora do cerco"
```

---

### Task 7: O checklist oficial passa a citar o gate

**Files:**
- Modify: `docs/arquitetura/permissoes-e-rls.md` (~linhas 204-213)

- [ ] **Step 1: Ler o checklist atual**

Run: `sed -n '195,220p' docs/arquitetura/permissoes-e-rls.md`

- [ ] **Step 2: Acrescentar o item que falta**

Inserir no checklist de tabela nova:

```markdown
- [ ] **A tabela entra no cerco do bloqueio por falta de pagamento?**
      Se ela guarda dado do cliente, sim — e não é preciso escrever nada: a rotina diária
      `gate-de-plano-conferencia-diaria` cria as políticas sozinha na madrugada seguinte, e o
      teste `src/test/gate-de-plano.test.ts` avisa antes disso, no build.
      Se ela NÃO deve entrar (log, catálogo compartilhado, preferência de tela, dado ligado ao
      login), acrescente o nome em **dois** lugares: `public.tabelas_fora_do_gate()` e a
      constante `EXCECOES` do teste. As duas listas têm de andar juntas.
```

- [ ] **Step 3: Conferir que o documento continua coerente**

Run: `grep -n "tabelas_fora_do_gate\|gate-de-plano" docs/arquitetura/permissoes-e-rls.md`
Expected: as duas referências aparecem.

- [ ] **Step 4: Commit**

```bash
git add docs/arquitetura/permissoes-e-rls.md
git commit -m "docs(rls): o checklist de tabela nova passa a citar o cerco do bloqueio"
```

---

## Verificação final da etapa

- [ ] `npx vitest run` → **672** em 40 arquivos
- [ ] `npx tsc --noEmit -p tsconfig.app.json` → **35** (linha de base)
- [ ] `npm run lint` → **456** (linha de base)
- [ ] `npm run build` → compila
- [ ] No banco: a consulta do Step 2 da Tarefa 3 devolve **0 linhas**
- [ ] No banco: `cron.job` tem `gate-de-plano-conferencia-diaria` ativa
- [ ] 🔴 **Testar logado como vendedor comum de uma empresa bloqueada**, não só como gestor
      (CLAUDE.md §9). Confirmar que ele vê, exporta, marca como lido — e não cria, não edita,
      não apaga, não manda WhatsApp.

## O que esta etapa NÃO faz

- Não mexe no Storage (as 23 políticas de arquivo continuam sem gate) — fica para a etapa 6.
- Não mexe nas ~40 funções que rodam no servidor com chave de serviço.
- Não conserta `perfis_customizados`, que não tem coluna de empresa.
- Não cria faixa de aviso nem liga a tela de cobrança — é a etapa 2.
