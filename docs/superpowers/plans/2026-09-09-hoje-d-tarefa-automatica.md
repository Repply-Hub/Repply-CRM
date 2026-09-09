# Plano D — A tarefa automática do "Retomar depois"

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa.

**Objetivo:** quando alguém adia um negócio, o sistema cria uma tarefa no nome do **dono do
negócio**, com o motivo digitado como descrição e prazo no dia do retorno — por uma caixinha
marcada por padrão, que a pessoa pode desmarcar. E a fila da tela "Hoje" passa a mostrar **uma
linha só** no dia do retorno, em vez de duas.

**Arquitetura:** `registrar_retorno` já grava o retorno e o aviso ao dono num gesto só; ganha um
terceiro. A fila deixa de listar o negócio quando existe tarefa aberta ligada a ele — o mesmo
critério que o cartão "Sem Próxima Ação" já usa.

**Pilha:** Postgres (`SECURITY DEFINER`) · React 18 + TypeScript · TanStack Query v5 · Vitest.

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit (CLAUDE.md §5).
- **Linha de base:** `npx tsc --noEmit -p tsconfig.app.json` → **31** (o `-p` é obrigatório);
  `npm run test` → **1140+** verdes; `npm run build` compila; `eslint` sem erro novo.
- 🔴 **QUEM APLICA MIGRATION EM PRODUÇÃO É O CONTROLADOR.** Você escreve o arquivo. Pode **ler** o
  banco com SELECT. Não pode `apply_migration`, DDL, INSERT/UPDATE/DELETE — nem com rollback.
- **Como nomear a migration:** `AAAAMMDDHHMMSS_nome_curto.sql`, com o carimbo **maior** que o do
  último arquivo da pasta. Descubra com `ls supabase/migrations/ | tail -3`. A ordem do nome é a
  ordem de aplicação, e este plano roda **depois** do Plano C.
  🔴 **Nunca edite migration já aplicada** (CLAUDE.md §6.3); só acrescente arquivo novo.
- 🔴 **`registrar_retorno` já existe e está no ar.** Acrescentar parâmetro com valor padrão cria
  **sobrecarga**, não substituição — passariam a existir duas funções e o PostgREST escolheria
  uma delas por sorte. Aqui é `DROP FUNCTION public.registrar_retorno(uuid, text, date);` seguido
  de `CREATE`, e o **`DROP` apaga as concessões**. Meça a `proacl` antes, reponha depois, meça de
  novo:
  ```sql
  select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_retorno';
  ```
  Esperado, nas duas medições: `postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres`.
- 🔴 **`pauta_do_dia_de(uuid)` é `CREATE OR REPLACE`, NUNCA `DROP`** — ela teve `authenticated`
  revogado de propósito e alimenta o e-mail das 7h.
- 🔴 **Colha o corpo vigente com `pg_get_functiondef` e edite esse texto.** Guarde o `md5(prosrc)`
  antes e depois no relatório.
- **Git:** `git status --short` num comando separado; outra sessão usa esta pasta. Nunca
  `git add -A`. `git commit -m "<msg>" --only -- <caminhos>`. Termine com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Sem `git push`.

## O que o banco já disse (medido em 09/09/2026 — não re-descubra)

`public.tarefas` tem **dois** campos de "quem", e eles não são intercambiáveis:

| coluna | tipo | o que guarda |
|---|---|---|
| `usuario_id` | `uuid` → `usuarios(id)` | **É por este que a fila e a tela de Tarefas decidem "é minha"** |
| `responsavel` | `text` | O **nome** da pessoa, para exibir |
| `criado_por` | `text` | O **nome** de quem criou |

🔴 Em todas as tarefas que existem hoje, os três apontam para a **mesma** pessoa. A tarefa deste
plano é a **primeira** em que criador e responsável diferem: quem clica é um, o dono do negócio é
outro. Preencha os três, e não confunda `usuario_id` (código) com `responsavel` (nome).

🔴 `tarefas.usuario_id` é da família `usuarios.id`, **não** `usuarios.user_id` (CLAUDE.md §4.5).
Errar não dá erro visível — a gravação inteira é recusada pela chave estrangeira e a pessoa vê
uma frase genérica.

Outros fatos: `status` tem `'pendente'` (padrão), `'em andamento'` e `'concluida'`; aberta é
`status <> 'concluida'`. `prazo_final` é `timestamptz`. `pedido_id` e `cliente_id` existem.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<data>_retomar_cria_tarefa.sql` **(novo)** | `registrar_retorno` ganha a tarefa; `pauta_do_dia_de` esconde o negócio que já tem tarefa aberta |
| `src/components/pauta/DialogoRetorno.tsx` | A caixinha "Criar tarefa para o responsável" |
| `src/hooks/use-pauta.ts` | Passa o novo argumento e invalida as tarefas |

---

## Tarefa 1: o banco cria a tarefa

**Arquivos:**
- Criar: `supabase/migrations/<AAAAMMDDHHMMSS>_retomar_cria_tarefa.sql`

**Interfaces:**
- Produz: `registrar_retorno(p_pedido_id uuid, p_motivo text, p_retorno_em date, p_criar_tarefa boolean default true) returns void`

- [ ] **Passo 1: colher o que está no ar**

```sql
select md5(prosrc), prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('registrar_retorno','pauta_do_dia_de');
select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('registrar_retorno','pauta_do_dia_de');
```

Guarde os quatro resultados no relatório.

- [ ] **Passo 2: escrever a migration**

Cabeçalho, em comentário:

```sql
-- ============================================================================
-- O "RETOMAR DEPOIS" CRIA UMA TAREFA PARA O DONO DO NEGÓCIO
-- ============================================================================
--
-- Decisão do dono do produto (09/09/2026): ao adiar, cria-se uma tarefa — por uma caixinha
-- marcada por padrão que a pessoa pode desmarcar. Prazo no dia do retorno, descrição = o motivo
-- digitado, responsável = O DONO DO NEGÓCIO, não quem clicou.
--
-- 🔴 DROP + CREATE, e não CREATE OR REPLACE: acrescentar parâmetro cria SOBRECARGA, e passariam
-- a existir duas `registrar_retorno`. O DROP apaga as concessões — elas são repostas no fim
-- deste arquivo, e a `proacl` foi medida antes para conferir depois.
--
-- 🔴 `tarefas` tem DOIS campos de quem: `usuario_id` (uuid, é por ele que a fila decide "é
-- minha") e `responsavel` (text, o nome, para exibir). Esta é a primeira tarefa do sistema em
-- que CRIADOR e RESPONSÁVEL são pessoas diferentes — todas as que existem hoje têm os dois
-- iguais. Os três campos são preenchidos, e `usuario_id` é da família `usuarios.id`
-- (CLAUDE.md §4.5): errar não dá erro visível, a gravação inteira é recusada.
-- ============================================================================
```

Depois, o `DROP` + `CREATE` de `registrar_retorno`, partindo do texto colhido e acrescentando:

1. o parâmetro `p_criar_tarefa boolean DEFAULT true`;
2. a declaração `v_titulo_tarefa text;` e `v_meu_nome` (já existe);
3. **depois** do `insert` em `historico_contatos` e **junto** do bloco do aviso:

```sql
  -- A tarefa vai para o DONO, não para quem clicou: quem adia o negócio de um colega está
  -- marcando trabalho na agenda dele, e é ele que precisa achar isso amanhã.
  if p_criar_tarefa and v_dono is not null then
    select u.nome into v_meu_nome from public.usuarios u where u.id = v_eu;
    insert into public.tarefas
      (titulo, descricao, status, prazo_final, responsavel, criado_por, usuario_id,
       pedido_id, cliente_id)
    select 'Retomar contato ' || v_titulo,
           nullif(trim(p_motivo),''),
           'pendente',
           p_retorno_em::timestamptz,
           v_dono_nome,
           coalesce(nullif(trim(v_meu_nome),''), 'Alguém da equipe'),
           v_dono,
           p_pedido_id,
           p.cliente_id
      from public.pedidos p where p.id = p_pedido_id;
  end if;
```

🔴 **`v_dono is not null` não é paranoia:** negócio sem dono existe, e `tarefas.usuario_id` sem
dono cria tarefa que não é de ninguém — ela nunca apareceria na fila de alguém e ficaria órfã.
Sem dono, **não se cria tarefa** e o resto do gesto acontece normalmente (o retorno é gravado; o
aviso já não sai, porque `v_dono is distinct from v_eu` é falso para nulo… **confira isso no
texto vigente antes de confiar** — `null is distinct from <uuid>` é **verdadeiro** em SQL, então
o aviso *tentaria* sair com destinatário nulo. Se for o caso, acrescente a mesma guarda ao bloco
do aviso e diga no relatório que consertou isto de passagem).

4. No fim do arquivo, reponha as concessões:

```sql
REVOKE ALL ON FUNCTION public.registrar_retorno(uuid, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno(uuid, text, date, boolean) TO authenticated;
```

- [ ] **Passo 3: a fila esconde o negócio que já tem tarefa aberta**

No **mesmo** arquivo, `CREATE OR REPLACE` de `pauta_do_dia_de` (nunca `DROP`), acrescentando à
CTE `candidatos`, no `where`:

```sql
      and not exists (
        -- Uma linha só no dia do retorno. Sem isto a pessoa veria a tarefa (que já entra como
        -- compromisso) E o negócio voltando à fila — duas linhas sobre o mesmo assunto, e a
        -- tarefa ainda comendo uma das vagas.
        -- QUALQUER tarefa aberta esconde, não só a que o "Retomar depois" cria: é o mesmo
        -- critério que o cartão "Sem Próxima Ação" já usa — tarefa aberta é próxima ação, venha
        -- de onde vier.
        select 1 from tarefas t
         where t.pedido_id = p.id and coalesce(t.status,'') <> 'concluida'
      )
```

- [ ] **Passo 4: provar por simulação, sem aplicar**

Você não aplica. Prove com `begin` / `rollback`, criando as funções dentro da transação e
desfazendo tudo no fim — é o método que o controlador usou em 08/09 e que funcionou.

Prove os quatro caminhos, e escreva o resultado de cada um no relatório:

1. Gestora adia negócio da Érika **com** a caixinha → grava o retorno, cria o aviso, **e** cria a
   tarefa com `usuario_id` = Érika, `responsavel` = "Érika Marques", `criado_por` = "Fabiola",
   `prazo_final` = o dia do retorno, `titulo` começando com "Retomar contato ".
2. A mesma coisa **sem** a caixinha (`p_criar_tarefa := false`) → retorno e aviso sim, tarefa
   **não**.
3. Negócio **sem dono** → sem tarefa, sem estouro.
4. A fila da Érika no dia do retorno → **uma** linha (a tarefa), não duas.

Identificadores: Érika `aa4b1d0f-fe58-4a9f-89a5-ce5ae2993c1e` (login
`93ef1364-318b-4e9e-8412-ce3ab902f32a`); Fabiola `fb5cb820-63e0-452e-9536-788d0ed55146` (login
`41ccd5c5-6b9e-4f82-af96-b7e52d92d1a4`).

Ao fim, confira que o `rollback` desfez tudo: `select count(*) from tarefas where titulo like 'Retomar contato %'` → **0**.

- [ ] **Passo 5: declarar em `types.ts` e commitar**

Atualize a assinatura de `registrar_retorno` em `src/integrations/supabase/types.ts` com o
parâmetro novo. **O build não avisa quando falta** (CLAUDE.md §6.8).

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
git status --short
git add supabase/migrations/<o arquivo novo>.sql
git commit -m "feat(pauta): adiar um negocio cria tarefa para o DONO dele, e a fila mostra uma linha so

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/<o arquivo novo>.sql src/integrations/supabase/types.ts
```

---

## Tarefa 2: a caixinha no diálogo

**Arquivos:**
- Modificar: `src/components/pauta/DialogoRetorno.tsx`
- Modificar: `src/hooks/use-pauta.ts` (`useRegistrarRetorno`)

**Interfaces:**
- Consome: `registrar_retorno(p_pedido_id, p_motivo, p_retorno_em, p_criar_tarefa)` (Tarefa 1).
- Produz: `useRegistrarRetorno()` passa a aceitar `{ pedidoId, motivo, retornoEm, criarTarefa }`.

- [ ] **Passo 1: o hook passa o argumento**

Em `src/hooks/use-pauta.ts`, acrescente `criarTarefa: boolean` ao objeto do `mutationFn` e mande
`p_criar_tarefa: args.criarTarefa`.

🔴 **Suba o erro do Supabase CRU**, como o arquivo já faz hoje (`if (error) throw error;`). O
diálogo é quem traduz com `mensagemDeErro`, que sabe ler `code`/`details`/`hint` — e é o `code`
`42501` que separa "empresa bloqueada" de "você não tem permissão neste negócio" (CLAUDE.md §4.6).
Embrulhar em `new Error(...)` aqui joga fora esses campos.

No `onSuccess`, acrescente a invalidação das tarefas, senão a tarefa nova só aparece ao recarregar:

```ts
      // A tarefa nasce agora e precisa aparecer na tela de Tarefas e na fila sem recarregar.
      qc.invalidateQueries({ queryKey: ['tarefas'] });
```

⚠️ **Confira a chave real** em `src/hooks/use-tarefas.ts` antes de escrever. Este arquivo já teve
uma invalidação escrita com hífen (`['historico-contatos']`) enquanto a consulta usava sublinhado
(`['historico_contatos']`) — nunca casaram, e ninguém percebeu por meses.

- [ ] **Passo 2: a caixinha**

Em `src/components/pauta/DialogoRetorno.tsx`, acrescente estado `criarTarefa` começando em
`true` e um `<Checkbox>` (o do shadcn, `@/components/ui/checkbox`) rotulado
**"Criar tarefa para o responsável"**.

Abaixo dele, uma linha de ajuda que diga o que vai acontecer, com o nome de quem vai receber
quando o negócio for de outra pessoa — o diálogo já sabe disso, porque a Etapa 3 fez o texto
mudar quando o item tem `responsavel`:

> *A tarefa vai para Érika Marques, com prazo em 15/09 e o motivo acima na descrição.*

Quando o negócio é da própria pessoa, a mesma linha diz *"A tarefa fica com você…"*.

⚠️ **Não invente um segundo diálogo para a tabela do time.** O Plano C manda a tabela abrir
**este** diálogo. Se o estado dele estiver preso em `Hoje.tsx`, o Plano C sobe o estado — não
duplique.

- [ ] **Passo 3: teste da decisão**

A frase de ajuda tem três casos (negócio meu / de colega / sem dono) e é fácil errar o
concordância. Extraia a decisão para uma função pura e teste — é o padrão que a Etapa 1 usou
(`src/lib/select-de-negocios.ts`) e o que permite testar sem montar React:

```ts
// src/lib/aviso-da-tarefa-do-retorno.ts
export function avisoDaTarefaDoRetorno(
  dono: string | null, retornoEm: string | null,
): string {
  if (!retornoEm) return 'Escolha a data para saber quando a tarefa vence.';
  const quando = retornoEm.split('-').reverse().slice(0, 2).join('/');
  if (!dono) return `A tarefa fica com você, com prazo em ${quando}.`;
  return `A tarefa vai para ${dono}, com prazo em ${quando}.`;
}
```

Escreva `src/lib/aviso-da-tarefa-do-retorno.test.ts` cobrindo os três casos **antes** de
implementar, rode e veja falhar, implemente, rode e veja passar.

⚠️ A data chega como `AAAA-MM-DD`. **Não** a passe por `new Date(...)` para formatar:
`new Date("2026-09-15")` no horário de Brasília devolve 14/09 (CLAUDE.md §7.12). Recortar o texto,
como acima, é imune a fuso.

- [ ] **Passo 4: provar no navegador**

Com `preview_start`. Não peça ao Lucas para conferir à mão.

1. Adiar um negócio próprio com a caixinha marcada → a tarefa aparece na tela de Tarefas, no seu
   nome, com o motivo na descrição.
2. Adiar um negócio de colega → a tarefa aparece **no nome do colega**, e o campo "criado por"
   traz o seu.
3. Desmarcar a caixinha → nenhuma tarefa é criada.
4. `read_console_messages` → sem erro.

- [ ] **Passo 5: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git add src/lib/aviso-da-tarefa-do-retorno.ts src/lib/aviso-da-tarefa-do-retorno.test.ts
git commit -m "feat(pauta): a caixinha Criar tarefa no dialogo de adiar, marcada por padrao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/aviso-da-tarefa-do-retorno.ts src/lib/aviso-da-tarefa-do-retorno.test.ts src/components/pauta/DialogoRetorno.tsx src/hooks/use-pauta.ts
```

---

## Como se prova que o plano D funcionou

| | Prova |
|---|---|
| A tarefa vai para o dono | `usuario_id` = dono, `responsavel` = nome do dono, `criado_por` = nome de quem clicou |
| A caixinha desliga | Com `p_criar_tarefa := false`, nenhuma linha em `tarefas` |
| Sem dono não estoura | Negócio com `usuario_id` nulo: retorno gravado, tarefa não criada, sem erro |
| Uma linha só | No dia do retorno, a fila da pessoa mostra a tarefa e **não** o negócio |
| A concessão voltou | `proacl` de `registrar_retorno` idêntica antes e depois do DROP |
| A revogação sobreviveu | `pauta_do_dia_de(uuid)` continua sem `authenticated` |

## O que este plano NÃO faz

- Não cria automação nem agendamento — é um gesto só, na hora do clique, como o dono do produto
  pediu.
- Não mexe na voz da tela nem do e-mail — isso é o Plano B.
- Não aplica nada em produção e não publica.
