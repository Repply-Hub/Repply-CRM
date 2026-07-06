# Investigação — Fase 5: tooling de consolidação de projetos Supabase

> **Conclusão objetiva (atualizada após revalidação — ver seção "Revalidação pós-fix"): a consolidação
> PODE PROSSEGUIR.** O bloqueador original (`configuracoes_automacao` com `UNIQUE(chave)` global e RLS de
> `SELECT` sem escopo) foi corrigido pela migration
> `supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql` e revalidado de ponta a
> ponta com um dry-run real de dois "clientes" simultâneos usando a mesma `chave` — sem colisão de
> constraint e com isolamento de RLS confirmado por teste comportamental (não só leitura de policy).
> Nenhum novo achado bloqueador surgiu na revalidação. A seção original abaixo (1-4) é mantida como
> registro histórico do estado **antes** da correção.

Nenhuma migration real foi aplicada durante a investigação original desta fase — apenas leitura de
`supabase/migrations/*.sql` e testes com Postgres local via Docker (ver seção "Metodologia de teste"). A
migration de correção em si, e sua revalidação, estão documentadas na seção "Revalidação pós-fix" ao final
deste arquivo.

## 1. Tipo de PRIMARY KEY das 10 tabelas

Todas as 10 tabelas usam **UUID gerado por `gen_random_uuid()`** como PK (nenhuma usa `serial`/`bigint`/
`identity`):

| Tabela | PK | Definição |
|---|---|---|
| `usuarios` | `id UUID DEFAULT gen_random_uuid()` | [20260305142619_...sql:7](../../supabase/migrations/20260305142619_49fc46f6-0ecc-4b54-b59c-c1d2549582db.sql#L7) (criada como `vendedores`) |
| `gmail_tokens` | `user_id UUID` (PK é o próprio `user_id`, não `id`) | [20260430170853_...sql:3](../../supabase/migrations/20260430170853_98772703-d3ad-489e-a062-051d06d444d0.sql#L3) |
| `emails_recebidos` | `id UUID DEFAULT gen_random_uuid()` | [20260429180826_...sql:2](../../supabase/migrations/20260429180826_c943bd7f-2ac2-4481-95bc-42063d357952.sql#L2) |
| `emails` | `id UUID DEFAULT gen_random_uuid()` | [20260427172837_...sql:3](../../supabase/migrations/20260427172837_750946a5-c7ed-4bea-b3c6-49aef390fb26.sql#L3) |
| `sidebar_preferences` | `id UUID DEFAULT gen_random_uuid()` | [20260409150534_...sql:3](../../supabase/migrations/20260409150534_28277b70-29e0-4ce0-a7df-947b5d993f65.sql#L3) |
| `wapi_instancia_usuarios` | `id UUID DEFAULT gen_random_uuid()` | [20260701000000_...sql:12](../../supabase/migrations/20260701000000_wapi_instancia_usuarios_retroativa.sql#L12) |
| `user_integrations` | `id UUID DEFAULT gen_random_uuid()` | [20260427180115_...sql:3](../../supabase/migrations/20260427180115_4adeed09-7986-4b2b-b84c-5accdbd148c7.sql#L3) |
| `user_domains` | `id UUID DEFAULT gen_random_uuid()` | [20260427181455_...sql:3](../../supabase/migrations/20260427181455_763c8543-0653-4df5-a841-4f57acd9a84e.sql#L3) |
| `eventos` | `id UUID DEFAULT gen_random_uuid()` | [20260326135929_...sql:3](../../supabase/migrations/20260326135929_88886457-4ca5-4541-a54d-19852d3905e5.sql#L3) |
| `configuracoes_automacao` | `id uuid DEFAULT gen_random_uuid()` | [20260306171805_...sql:4](../../supabase/migrations/20260306171805_4a1fcd55-d9cd-4b0d-bb63-89e9b6bb1f1a.sql#L4) |

**Achado operacional confirmado durante o teste dos scripts**: `gmail_tokens` **não tem coluna `id`
nenhuma** — sua PK é literalmente `user_id`. O primeiro rascunho de `inventory.ts` assumia `SELECT id` para
todas as tabelas e quebrou ao rodar contra um Postgres real (`error: column "id" does not exist`). Corrigido
lendo a PK real via `pg_index`/`pg_attribute` (`scripts/migration/lib/db.ts`, função
`primaryKeyColumns`) em vez de assumir o nome da coluna — isso só foi pego porque o dry-run rodou contra um
banco de verdade, não um mock.

## 2. Grafo estendido (tabelas referenciadas por essas 10)

- `usuarios.empresa_id` → `empresas.id` — [20260326000001_...sql:17](../../supabase/migrations/20260326000001_empresas_e_funcionarios.sql#L17)
- `wapi_instancia_usuarios.instancia_id` → `configuracoes_wapi.id` — [20260701000000_...sql:13](../../supabase/migrations/20260701000000_wapi_instancia_usuarios_retroativa.sql#L13)
- `configuracoes_wapi.empresa_id` → `empresas.id` (confirmado na fase 2 desta investigação, migration `20260618000000_wapi_empresa_rls.sql`)
- `configuracoes_automacao.updated_by`, `eventos.user_id`, `gmail_tokens.user_id`, etc. → `auth.users.id`

`empresas.id` também é UUID/`gen_random_uuid()` ([20260326000001_...sql:8](../../supabase/migrations/20260326000001_empresas_e_funcionarios.sql#L8) e a segunda definição em [20260326172702_...sql:4](../../supabase/migrations/20260326172702_97bf4a50-4208-4458-8e4c-e2e01f0510a6.sql#L4)).

**Achado de drift confirmado**: existem **duas definições conflitantes de `CREATE TABLE public.empresas`**
no histórico de migrations, no mesmo dia (`20260326000001` às 00:00:01 e `20260326172702` às 17:27:02),
sem nenhum `DROP TABLE public.empresas` entre elas — a segunda deveria falhar com "relation already
exists" se ambas tivessem rodado literalmente em sequência contra o mesmo banco. Isso é o mesmo tipo de
drift já documentado no comentário de
[20260701000000_wapi_instancia_usuarios_retroativa.sql:1-9](../../supabase/migrations/20260701000000_wapi_instancia_usuarios_retroativa.sql#L1-L9)
("schema drift: tabela e RLS foram criadas direto em produção"). **Conclusão prática**: os arquivos de
migration NÃO são fonte confiável do schema real de cada cliente. Por isso `inventory.ts`/`export.ts`
sempre introspectam o schema ao vivo via `information_schema` (ver `scripts/migration/lib/db.ts`,
`tableExists`/`columnExists`) em vez de assumir que o que está nas migrations é o que existe em produção —
qualquer script de migração de dados real precisa rodar `inventory.ts` primeiro em cada cliente e
comparar manualmente com o que os migrations "deveriam" ter criado.

## 3. UNIQUE constraints não escopadas por empresa/usuário

| Tabela | Constraint | Escopada? | Risco |
|---|---|---|---|
| `configuracoes_automacao.chave` | `UNIQUE` (coluna `chave` sozinha) | **Não** — tabela não tem `empresa_id` no schema real (só existe numa segunda definição "morta", `CREATE TABLE IF NOT EXISTS`, que nunca roda pois a tabela já existe) | **BLOQUEADOR CONFIRMADO** — [20260306171805_...sql:5](../../supabase/migrations/20260306171805_4a1fcd55-d9cd-4b0d-bb63-89e9b6bb1f1a.sql#L5). Reproduzido no dry-run real (seção "Metodologia de teste"): a segunda empresa importada falha com `duplicate key value violates unique constraint "configuracoes_automacao_chave_key"` na linha seedada por `INSERT INTO public.configuracoes_automacao (chave, valor) VALUES ('alerta_inatividade', ...)` ([mesma migration, linha 23-24](../../supabase/migrations/20260306171805_4a1fcd55-d9cd-4b0d-bb63-89e9b6bb1f1a.sql#L23-L24)) que toda empresa recebe como seed. |
| `emails_recebidos.resend_id` | `UNIQUE NOT NULL` (na criação) depois `DROP NOT NULL` | Não — global | Risco baixo na prática: são IDs gerados pelo Resend, efetivamente globais por natureza. Ver [20260429180826_...sql:3](../../supabase/migrations/20260429180826_c943bd7f-2ac2-4481-95bc-42063d357952.sql#L3) e [20260506171854_...sql:19](../../supabase/migrations/20260506171854_15f0ba11-fd8f-426f-8b65-86055ef59da1.sql#L19). |
| `emails_recebidos.gmail_message_id` | `UNIQUE` (adicionada depois) | Não — global, não escopada por `user_id` | Risco baixo na prática (IDs de mensagem do Gmail são efetivamente globais), mas arquiteturalmente é um "code smell" para multi-tenant — [20260506171854_...sql:14](../../supabase/migrations/20260506171854_15f0ba11-fd8f-426f-8b65-86055ef59da1.sql#L14). |
| `empresas.cnpj` | `UNIQUE` | Global por design (correto — CNPJ deve ser único na plataforma inteira) | Não é bug. |
| `empresas.codigo_acesso` | `UNIQUE` | Global por design (é o código que um funcionário usa pra entrar numa empresa específica — precisa ser único na plataforma) | Não é bug. |
| `gmail_tokens.user_id`, `sidebar_preferences.user_id`, `user_integrations.user_id` | `UNIQUE` | Escopada por `auth.users.id` (que já é 1:1 com empresa, ver fase 3) | Não é bug — comportamento esperado (1 conexão Gmail/preferência/integração por usuário). |

**Nenhuma outra das 10 tabelas tem `UNIQUE` fora de PK que não seja escopada corretamente.**

## 4. RLS pós-consolidação — isolamento depende só de `empresa_id`/`user_id`?

| Tabela | Policy de SELECT | Escopada? |
|---|---|---|
| `usuarios`, `gmail_tokens`, `emails_recebidos`, `emails`, `sidebar_preferences`, `user_integrations`, `user_domains`, `eventos` | `auth.uid() = user_id` (ou equivalente) | Sim — depende da premissa "1 auth = 1 empresa" confirmada na fase 3, mas está corretamente restrita ao próprio usuário. |
| `wapi_instancia_usuarios` | Escopada via join com `configuracoes_wapi.empresa_id` | Sim |
| `empresas` | `id = get_my_empresa_id()` (SELECT), `owner_id = auth.uid()` (INSERT/UPDATE) — corrigida em [20260413223933_...sql:53-59](../../supabase/migrations/20260413223933_53e54e39-15fc-4890-b063-bd9e4f88fb81.sql#L53-L59), substituindo uma versão anterior (`20260326172702_...sql:16-26`) que usava `is_gestor()` sozinho (sem checar `empresa_id`) — a versão antiga teria permitido qualquer gestor de qualquer empresa mexer em empresas alheias, mas já foi corrigida por uma migration posterior. | Sim, na versão vigente. |
| **`configuracoes_automacao`** | `USING (true)` — **nunca foi corrigida** ([20260306171805_...sql:13-14](../../supabase/migrations/20260306171805_4a1fcd55-d9cd-4b0d-bb63-89e9b6bb1f1a.sql#L13-L14)); `INSERT`/`UPDATE` foram restritos a `is_admin() OR is_gestor()` numa migration posterior ([20260413223933_...sql:284-290](../../supabase/migrations/20260413223933_53e54e39-15fc-4890-b063-bd9e4f88fb81.sql#L284-L290)), mas **sem checar empresa** — qualquer gestor de qualquer empresa poderia atualizar a config de automação de outra empresa, e **qualquer usuário autenticado pode ler a config de todas as empresas**. | **Não** — segundo achado que reforça o bloqueio da seção 3: mesmo contornando a colisão de `chave`, o vazamento de leitura/escrita cross-tenant nesta tabela persiste até uma migration corrigir a policy. |

## Ação necessária antes de consolidar o primeiro par de clientes

**Status: feita e revalidada** (ver "Revalidação pós-fix" ao final). A migration
`supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql`:
1. Adiciona `empresa_id UUID REFERENCES empresas(id)` a `configuracoes_automacao`.
2. Troca `UNIQUE(chave)` por `UNIQUE(empresa_id, chave)`.
3. Faz backfill de `empresa_id` nas linhas existentes (associando à empresa mais antiga em
   `empresas`, com fallback defensivo para duplicar a config em empresas extras se houver mais de uma).
4. Reescreve as 3 policies (`automacao_config_select`, `_upsert`, `_update`) para escopar por
   `empresa_id = get_my_empresa_id()` (mesmo padrão já usado em `usuarios`/`clientes`/etc.).

As outras 9 tabelas do grafo (`usuarios`, `gmail_tokens`, `emails_recebidos`, `emails`,
`sidebar_preferences`, `wapi_instancia_usuarios`, `user_integrations`, `user_domains`, `eventos`) podem ser
consolidadas como estão — nenhum ajuste de schema encontrado para elas.

## Metodologia de teste (para reproduzir)

Sem acesso a um projeto Supabase de staging real neste ambiente, os scripts foram validados com **dois
containers Postgres 15 via Docker** (`migtest-source`, `migtest-staging`), com um schema reduzido
reproduzindo fielmente as 10 tabelas + `empresas`/`configuracoes_wapi`/`auth.users` (incluindo a mesma
`UNIQUE(chave)` global e a mesma policy `USING (true)` encontradas na investigação). Isso é um dry-run
**real** (inserções, constraints e rollback de Postgres de verdade), não uma simulação — mas roda contra
Postgres puro, não contra a stack completa do GoTrue/Supabase (sem `auth.uid()` real, sem roles
`authenticated`/`anon`). Antes de rodar contra o staging Supabase real do time, repita este mesmo passo a
passo (RUNBOOK.md) apontando `SOURCE_DB_URL`/`DEST_DB_URL` para as connection strings reais.

Dois bugs reais foram encontrados e corrigidos durante esse teste (não apenas hipotéticos):
1. `inventory.ts` assumia coluna `id` em toda tabela — quebrou em `gmail_tokens` (PK é `user_id`).
   Corrigido lendo a PK via catálogo do Postgres.
2. `import-dry-run.ts` não isolava erros por tabela — um erro de constraint numa tabela abortava a
   transação inteira e impedia a auditoria de RLS de rodar depois. Corrigido com `SAVEPOINT`/
   `ROLLBACK TO SAVEPOINT` por tabela.

## Revalidação pós-fix (fase 6)

> Executada com a migration `20260706190000_configuracoes_automacao_multi_empresa.sql` já criada (mas
> ainda não commitada) — ver relatório da fase anterior. Nenhuma alteração foi feita nessa migration
> durante esta revalidação; qualquer problema encontrado seria reportado sem correção automática (não foi
> o caso).

### O que mudou em `scripts/migration/lib/graph.ts`

`configuracoes_automacao` deixou de ser tratada como tabela "global" isolada no grafo — agora tem
`empresaColumn: 'empresa_id'` (igual a `usuarios`/`configuracoes_wapi`), e o comentário antigo sobre o
bloqueio foi substituído por uma referência a esta seção. Sem essa mudança o `inventory.ts` continuaria
funcionando (ele já introspecta o schema ao vivo independente do que está no grafo estático), mas o grafo
deixaria de refletir corretamente que a tabela agora exige o mesmo cuidado de outras tabelas escopadas por
empresa.

### Metodologia desta revalidação

Dois containers Postgres 15 novos (`migtest6-source`, `migtest6-staging`), desta vez com:
- roles `authenticated`/`anon`/`service_role` reais (não existiam no teste da fase 5 original);
- as funções helper reais (`is_admin()`, `is_gestor()`, `get_my_empresa_id()`), com as mesmas definições
  das migrations 20260413223933/20260416174744, para poder aplicar a migration real do fix **verbatim**
  (não uma adaptação) — a fase 5 original usava policies simplificadas (`USING (true)`) como placeholder
  em várias tabelas só para exercitar a mecânica dos scripts, o que não permitiria rodar o arquivo de
  migration de verdade;
- `configuracoes_automacao` criada no estado **pré-fix** exato (idêntico a
  20260306171805 + 20260413223933), com a migration `20260706190000` aplicada por cima **verbatim**
  (arquivo copiado para dentro do container e executado com `psql -f`, sem edição).

Fluxo de teste:
1. **Cliente A** ("Acme Materiais") seedado no container origem: empresa, usuário, `gmail_tokens`, e
   `configuracoes_automacao` com `chave = 'alerta_inatividade'`.
2. Cliente A exportado via `pg_dump --data-only --column-inserts` (mesma abordagem validada na fase 4) e
   **commitado de verdade** no container staging — simulando "já migrado antes" (não dá pra usar
   `import-dry-run.ts` para isso, já que ele sempre reverte por design).
3. Container origem limpo (`TRUNCATE ... CASCADE`) e repovoado com **Cliente B** ("Beta Construções"):
   empresa e usuário diferentes, e `configuracoes_automacao` com a **mesma** `chave = 'alerta_inatividade'`
   — o cenário exato que colidia antes do fix.
4. `inventory.ts` (Cliente B × staging já com Cliente A): **nenhuma colisão de UUID** — esperado, já que a
   checagem de colisão é por PK própria (`id`), não pela `chave` de negócio.
5. `export.ts` do Cliente B → conferido manualmente que `configuracoes_automacao.json` exportado carrega o
   `empresa_id` real da empresa Beta da origem (`90ececce-...`), não um placeholder nem o `empresa_id` da
   Acme — ou seja, não há "remapeamento" de UUID no fluxo atual (os scripts preservam tudo verbatim); a
   preocupação do prompt sobre "apontar pro registro correto pós-remapeamento" não se aplica porque **não
   há remapeamento** — cada empresa mantém seu próprio UUID original, e é exatamente por isso que a
   checagem de colisão do passo 4 existe (ela é o que impediria dois UUIDs de empresa colidirem, não
   qualquer lógica de remapeamento).
6. `import-dry-run.ts` do Cliente B contra o staging (já com Cliente A committado):
   `[OK] configuracoes_automacao: 1/1 inseridas` — **sem violação de `UNIQUE(empresa_id, chave)`**, e a
   auditoria de RLS mostra `[ok]` nas 3 policies de `configuracoes_automacao` (a comparação com `[RISCO]`
   nas policies `USING (true)` de `empresas`/`usuarios`/`configuracoes_wapi`/`wapi_instancia_usuarios`
   nesta mesma saída é esperada e **não é uma regressão**: essas 4 tabelas foram deixadas com policy
   simplificada de propósito neste fixture de teste, só para focar no fix de `configuracoes_automacao` —
   na fase 3 desta migração já havia sido confirmado que, na produção real, `usuarios` tem RLS
   corretamente escopada por `empresa_id`; `empresas` também, desde 20260413223933). Transação sempre
   revertida no final — staging ficou intocado pelo dry-run em si.

### Teste comportamental de RLS (além da auditoria estática do script)

A auditoria embutida em `import-dry-run.ts` só inspeciona o **texto** da policy (`pg_policies.qual`), não
executa uma query de verdade simulando dois usuários diferentes. Para validar de fato o isolamento pedido
no passo 5, o Cliente B também foi commitado de verdade no staging (mesmo método `pg_dump` do Cliente A) e
testado com `SET ROLE authenticated` + `set_config('app.current_user_id', ...)` simulando `auth.uid()` de
cada gestor:

| Operação | Simulando | Resultado | Esperado |
|---|---|---|---|
| `SELECT chave, valor FROM configuracoes_automacao` | gestor da Acme | só a linha da Acme (`{"dias": 5, ...}`) | ✅ |
| `SELECT chave, valor FROM configuracoes_automacao` | gestor da Beta | só a linha da Beta (`{"dias": 7, ...}`) | ✅ |
| `UPDATE ... WHERE chave = 'alerta_inatividade'` | gestor da Acme (sem WHERE por empresa) | `UPDATE 1` — só a própria linha, Beta não mudou | ✅ |
| `UPDATE ... WHERE empresa_id = <Beta>` | gestor da Acme mirando a empresa da Beta | `UPDATE 0` — RLS bloqueou | ✅ |
| `INSERT (empresa_id=<Beta>, chave='nova_config_beta', ...)` | gestor da Beta, para a própria empresa | `INSERT 0 1` — permitido | ✅ |
| `INSERT (empresa_id=<Acme>, chave='config_maliciosa', ...)` | gestor da Beta, para a empresa da Acme | `ERROR: new row violates row-level security policy` | ✅ |
| `DELETE WHERE chave = 'alerta_inatividade'` | gestor da Acme, na própria linha | `DELETE 0` — bloqueado | ✅ esperado: nunca existiu policy de DELETE para esta tabela (nem antes nem depois do fix), então RLS ativado sem policy de DELETE bloqueia qualquer DELETE por `authenticated` — comportamento pré-existente, não alterado pela migration. |

Todos os 7 comportamentos bateram com o esperado. Nenhum achado novo.

### Conclusão da revalidação

**Nenhum bloqueador remanescente encontrado.** A migration `20260706190000` resolve exatamente o problema
identificado na fase 5 (colisão de `UNIQUE(chave)` e vazamento de leitura/escrita cross-tenant), validado
com dado real de duas empresas simultâneas — não apenas com a migration isolada rodando sozinha contra uma
tabela vazia (como no teste do prompt anterior), mas com o cenário completo de dois clientes
export→import→convivendo no mesmo destino.
