# Runbook — consolidação de clientes single-tenant no projeto Supabase único

> Leia [INVESTIGACAO.md](./INVESTIGACAO.md) primeiro. O bloqueador de schema que existia em
> `configuracoes_automacao` foi corrigido e revalidado (migration
> `supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql`, ver seção "Revalidação
> pós-fix" em `INVESTIGACAO.md`) — não há mais pré-requisito de schema bloqueador conhecido para consolidar
> os 10 clientes atuais.

## Visão geral do fluxo

```
inventory.ts (origem)  →  export.ts (origem → arquivos locais)  →  inventory.ts (colisão origem×destino)
                                                                          ↓ sem colisão
                                                              import-dry-run.ts (arquivos → STAGING, ROLLBACK sempre)
                                                                          ↓ "Dry-run OK", sem [ERRO] nem [RISCO]
                                                              import.ts --confirm=<cliente> (arquivos → PRODUÇÃO, COMMIT real)
```

`import-dry-run.ts` só grava dentro de uma transação que é sempre revertida (`ROLLBACK`), mesmo em caso de
sucesso — é o único script pensado para rodar contra qualquer destino sem risco. `import.ts` é o único
script deste diretório que grava de fato (`COMMIT`) — **nunca rode `import.ts` direto sem antes rodar
`import-dry-run.ts` contra um staging com o mesmo schema do destino real.**

## Pré-requisito 0: migration de ajuste do schema (resolvido)

~~Antes de consolidar o segundo cliente, aplicar uma migration que adiciona `empresa_id` a
`configuracoes_automacao`...~~ — **já aplicada e revalidada**: `empresa_id` foi adicionado, a constraint
virou `UNIQUE(empresa_id, chave)` e as 3 RLS policies passaram a escopar por empresa
(`supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql`). Revalidação de ponta a
ponta com dois "clientes" simultâneos usando a mesma `chave` confirmou: sem colisão de constraint no
`import-dry-run.ts`, e isolamento de SELECT/UPDATE/INSERT correto por empresa em teste comportamental de
RLS (não só leitura estática de policy) — ver `INVESTIGACAO.md`, seção "Revalidação pós-fix".

Antes desse fix, `import-dry-run.ts` reportava `[ERRO] configuracoes_automacao: ... duplicate key value
violates unique constraint` a partir do segundo cliente — isso não deve mais acontecer. Se reaparecer,
trate como regressão (confirme que a migration `20260706190000` foi de fato aplicada no projeto sendo
migrado antes de prosseguir).

## Pré-requisitos por cliente

- **Credenciais**: connection string Postgres direta (`postgresql://postgres:[senha]@[host]:5432/postgres`
  ou o pooler de conexão) do projeto Supabase do cliente sendo migrado, com privilégio de leitura em
  `auth` e `public`. Pegar em Project Settings → Database → Connection string (modo "Session" ou direto,
  não o pooler transacional, para evitar timeout em exports grandes).
- **Aprovação de janela de manutenção**: quem aprova é o dono do produto (ou quem faz esse papel na
  Repply) + o responsável técnico pelo cliente sendo migrado, porque:
  - o cliente fica temporariamente sujeito a possível instabilidade se o export rodar durante uso ativo
    (recomo­dado rodar fora do horário comercial do cliente);
  - o passo de import REAL (fora deste runbook de dry-run) exige trocar `SUPABASE_URL`/`APP_URL`/
    `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` do cliente para o projeto único, o que derruba
    temporariamente a sessão de todos os usuários daquele cliente (ver fase 1-4 desta migração).
- **Staging**: um projeto Supabase de teste (ou banco Postgres local) com o mesmo schema do projeto único
  de destino, para rodar `import-dry-run.ts` sem nenhum risco ao destino real.

## Passo a passo

### 1. Inventariar a origem

```bash
SOURCE_DB_URL='postgresql://...' npx tsx scripts/migration/inventory.ts
```

Confirma que o schema ao vivo do cliente bate com o esperado (nenhuma tabela `[AUSENTE]` inesperada — se
aparecer, o cliente tem drift de schema em relação ao resto da frota, investigar antes de prosseguir).

### 2. Checar colisão de UUID contra o destino

```bash
SOURCE_DB_URL='postgresql://...' DEST_DB_URL='postgresql://...' npx tsx scripts/migration/inventory.ts
```

Se aparecer qualquer `[COLISAO]`, **pare aqui** — ver seção "Conflito de colisão de UUID" abaixo.

### 3. Exportar os dados do cliente

```bash
SOURCE_DB_URL='postgresql://...' EXPORT_CLIENT_SLUG='nome-do-cliente' npx tsx scripts/migration/export.ts
```

Gera `scripts/migration/exports/nome-do-cliente/*.json` + `manifest.json`. **Esses arquivos contêm dados
reais de clientes (tokens OAuth, e-mails, etc.) — nunca commitar** (`scripts/migration/.gitignore` já
ignora `exports/`; mesmo assim, tratar a pasta como teria que tratar um backup de produção: apagar depois
de usar, não deixar em laptop pessoal sem criptografia).

### 4. Dry-run de import contra staging

```bash
DEST_DB_URL='postgresql://...(staging)...' IMPORT_CLIENT_SLUG='nome-do-cliente' npx tsx scripts/migration/import-dry-run.ts
```

Lê o mesmo `EXPORT_CLIENT_SLUG` (aqui chamado `IMPORT_CLIENT_SLUG`) e tenta inserir tudo dentro de uma
transação com um `SAVEPOINT` por tabela — um erro numa tabela não impede o relatório das demais. No final,
roda uma auditoria de RLS (lista policies e sinaliza `SELECT ... USING (true)` sem escopo de
empresa/usuário) e sempre faz `ROLLBACK` da transação inteira, com sucesso ou erro.

**Só prossiga para o import real (`import.ts`, passo 5) se a saída terminar em "Dry-run OK".** Qualquer
`[ERRO]` ou `[RISCO]` na auditoria de RLS deve ser resolvido antes — `import.ts` roda a mesma auditoria e
recusa a fazer `COMMIT` se encontrar `[RISCO]`, mas o dry-run existe pra pegar isso mais cedo, contra um
staging, sem consumir o "cartão" de idempotência do cliente no destino real.

### 5. Import real (`import.ts`)

```bash
DEST_DB_URL='postgresql://...(PRODUÇÃO, o projeto único)...' IMPORT_CLIENT_SLUG='nome-do-cliente' \
  npx tsx scripts/migration/import.ts --confirm=nome-do-cliente
```

`import.ts` reaproveita a mesma leitura/inserção/auditoria de `import-dry-run.ts` (via
`lib/import-shared.ts`), mas com quatro diferenças:

1. **Exige `--confirm=<slug>` idêntico a `IMPORT_CLIENT_SLUG`.** Sem isso (ou com valor diferente), o
   script aborta **antes de sequer conectar no banco** — não dá pra rodar contra o projeto errado só por
   esquecer um argumento, nem por copiar/colar o comando do cliente errado.
2. **Roda a checagem de colisão de UUID automaticamente**, a partir dos arquivos já exportados (não
   precisa de `SOURCE_DB_URL` nesta etapa) — não existe flag para pular essa checagem. Se achar qualquer
   colisão, aborta sem abrir transação de escrita.
3. **É idempotente por cliente**: se já existir um log de import **commitado** para aquele
   `IMPORT_CLIENT_SLUG` em `scripts/migration/logs/<slug>/`, recusa rodar de novo (mesmo que a flag de
   confirmação esteja certa) — protege contra rodar o mesmo cliente duas vezes por engano.
4. **A auditoria de RLS roda dentro da mesma transação do import**, antes do `COMMIT`. Se achar qualquer
   `[RISCO]` (ou se algum insert tiver dado erro), faz `ROLLBACK` automático — nenhum dado fica persistido
   — e grava um log de auditoria com o motivo. Só chega a `COMMIT` se tudo passar limpo.

Todo import real (commitado, revertido ou abortado) grava um arquivo JSON em
`scripts/migration/logs/<slug>/<timestamp>.json` (git-ignorado — `scripts/migration/.gitignore` cobre
`logs/` além de `exports/`) com: status (`committed`/`rolled_back`/`aborted`), contagem de linhas
tentadas/inseridas por tabela, hash sha256 dos arquivos de origem usados, e — em caso de rollback por RLS —
quais policies foram sinalizadas. Esse log é o que a checagem de idempotência do item 3 consulta; **não
apagar manualmente** sem ter certeza de que o destino real está limpo.

## Conflito: checagem de colisão de UUID encontrou conflito

1. Não prosseguir com export/import desse cliente.
2. Rodar `inventory.ts` de novo anotando exatamente quais tabelas colidiram e quais IDs.
3. Como toda a frota usa `gen_random_uuid()` (confirmado em `INVESTIGACAO.md` seção 1), colisão real entre
   dois clientes distintos é estatisticamente improvável — o cenário mais provável é o cliente já ter sido
   parcialmente importado antes (reexecução acidental do runbook) ou o "destino" apontado ser o projeto
   errado. Confirmar isso antes de qualquer outra ação.
4. Se for de fato uma colisão genuína (não reexecução acidental), a linha específica não pode ser
   importada com o ID original — decidir, caso a caso, entre gerar um novo UUID para aquela linha
   específica (e para toda a cadeia de FKs que aponta pra ela) ou investigar por que dois `gen_random_uuid()`
   produziram o mesmo valor (bug de seed determinístico em algum ambiente de teste, por exemplo).

## Rollback

- **Durante o dry-run**: automático — `import-dry-run.ts` sempre roda `ROLLBACK` no final, com sucesso ou
  erro. Nada precisa ser desfeito manualmente.
- **Se `import.ts` falhar no meio, encontrar erro de integridade, ou a auditoria de RLS achar
  `[RISCO]`**: automático também — `ROLLBACK` acontece antes de qualquer `COMMIT`, dentro da mesma
  invocação (testado de verdade: ver seção "Validação de `import.ts`" abaixo). Não há estado parcial a
  limpar no banco de destino nesses casos; o log em `scripts/migration/logs/<slug>/` registra o motivo
  (`status: "rolled_back"` ou `"aborted"`).
- **Se o import real já tiver sido commitado (`status: "committed"` no log) e precisar ser desfeito
  depois** (ex.: um problema só descoberto após a virada de DNS/redirect): identificar todas as linhas
  daquele cliente pelo `empresa_id` (ou, para as tabelas sem `empresa_id`, pelos `user_id` que pertencem
  aos `usuarios` daquele `empresa_id`) e apagar em ordem reversa à de `lib/graph.ts` (dependentes antes de
  dependências) dentro de uma transação. **Não existe hoje um script pronto para esse rollback
  pós-commit** — construir um antes do primeiro import real em produção, não confiar em fazer isso
  manualmente sob pressão. Depois de limpar manualmente, apagar (ou mover) o log `committed` daquele
  cliente antes de tentar reimportar, já que `import.ts` recusa rodar de novo enquanto esse log existir.

## Validação de `import.ts` (executada, não hipotética)

`import.ts` foi validado com dois containers Postgres reais (schema completo + RLS real, não
placeholders) simulando três clientes diferentes:

1. **Import real de um cliente novo**: `COMMIT` efetivo confirmado consultando o banco de destino depois
   do processo terminar (dado persiste), e log `status: "committed"` gravado com contagem de linhas e
   checksum.
2. **Reexecução do mesmo cliente**: abortou antes de conectar no banco de escrita, com mensagem apontando
   para o log do import anterior — nenhuma linha duplicada.
3. **Regressão de RLS simulada** (uma policy de `SELECT` de outra tabela alterada para `USING (true)`
   diretamente no destino, fora da migration real): `import.ts` inseriu os dados dentro da transação,
   detectou o `[RISCO]` na auditoria, fez `ROLLBACK` automático e gravou o log com `status: "rolled_back"`
   e o `rlsFindings` correspondente — confirmado que nenhuma linha desse cliente ficou no destino depois.
4. **Flag de confirmação ausente ou divergente do `IMPORT_CLIENT_SLUG`**: abortou imediatamente, sem
   sequer exigir `DEST_DB_URL` configurado (a checagem acontece antes de qualquer tentativa de conexão).

## O que este runbook não cobre (propositalmente)

- A troca de `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/redirect URI/`APP_URL` para o projeto único — já
  resolvido nas fases 1-2 desta migração (redirect URI dinâmico via `SUPABASE_URL`).
- Migração de Storage (arquivos, ex. logos, anexos) — fora do escopo do grafo de tabelas SQL investigado
  aqui.
- Script de rollback pós-`COMMIT` (ver seção "Rollback" acima) — ainda não existe, construir antes do
  primeiro import real em produção.
