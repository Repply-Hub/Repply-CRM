# Etapa 3 — A permissão e a pauta ampliada

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** uma chave de permissão por pessoa decide se ela vê a pauta e os números só dos
próprios negócios ou os de toda a equipe. Quem tem a chave também **age**: adia negócio de colega,
e o dono é avisado.

**Arquitetura:** a chave é uma funcionalidade `pauta_de_todos` dentro do módulo `pedidos`. A
função `pauta_do_dia()` continua sendo a única porta do navegador e passa a decidir o alcance
lendo a configuração **direto**, com o papel entrando só como padrão. O aviso ao dono é criado
por função com privilégio, porque a regra de `notificacoes` exige papel de gestor para inserir.

**Tecnologias:** React 18 + TypeScript + Vite · Supabase (Postgres, RLS, funções) · TanStack Query.

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit.
- **`npx tsc --noEmit -p tsconfig.app.json`** — com o `-p`. Linha de base **31 erros**; não pode subir.
- **`git push` PUBLICA em produção.** Rode a verificação ANTES de enviar.
- **Nunca `git add -A`.** Liste os arquivos; confira `git status --short` em comando separado.
- **Antes de começar:** `git fetch origin && git log --oneline HEAD..origin/main`.
- **Migration nova, nunca editar existente.**
- 🔴 **`usuarios.id` ≠ `usuarios.user_id`.** `notificacoes.usuario_id` e
  `historico_contatos.usuario_id` são da família `usuarios(id)` → `get_my_usuario_id()`. Errar não
  dá erro: grava zero linhas.
- 🔴 **`pedidos` NÃO tem coluna de empresa.** O recorte por empresa passa por `usuarios`. Errar
  isso numa função com privilégio vaza entre empresas, em silêncio.
- **Depende das Etapas 1 e 2** publicadas.
- **Avisar a equipe da MD no dia anterior** à publicação: o e-mail das 7h muda.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/secoes.ts` | **Modificar.** Ganha `secaoQueMandaNoModulo()`, determinística |
| `src/lib/secoes.test.ts` | **Modificar.** Fixa que `pedidos` resolve para `pipeline`, não para `hoje` |
| `src/components/configuracoes/PermissaoMatrizChecklist.tsx` | **Modificar.** Usa a função nova; ganha o interruptor da chave |
| `src/components/configuracoes/PermissaoMatrixEditor.tsx` | **Modificar.** Usa a função nova |
| `src/hooks/use-permissoes.ts` | **Modificar.** A chave entra em `MODULOS.pedidos.funcionalidades` |
| `supabase/migrations/<ts>_pauta_de_todos.sql` | **Criar.** Preset + backfill + a pauta ampliada + a regra de adiar + a função do aviso |
| `src/hooks/use-pauta.ts` | **Modificar.** `ItemDaPauta` ganha `responsavel`; o retorno chama a função do aviso |
| `src/pages/Hoje.tsx` | **Modificar.** Mostra o dono no item que não é seu |
| `src/components/pauta/RadarDeRisco.tsx` | **Modificar.** O filtro de responsável passa a depender da chave |
| `src/hooks/use-minha-permissao.ts` | **Modificar.** Expõe se EU tenho a chave |
| `src/integrations/supabase/types.ts` | **Modificar.** Declarar a coluna e a função novas |

---

## Tarefa 1 — Consertar o casamento seção→módulo (bug vivo, independente)

**Arquivos:**
- Modificar: `src/lib/secoes.ts` (acrescentar função no fim)
- Modificar: `src/lib/secoes.test.ts`
- Modificar: `src/components/configuracoes/PermissaoMatrizChecklist.tsx:71`
- Modificar: `src/components/configuracoes/PermissaoMatrixEditor.tsx:104`

**Interfaces:**
- Produz: `secaoQueMandaNoModulo(moduloKey: string): Secao | undefined`.

**O defeito, medido:** as duas telas de permissão escondem o módulo quando a seção dele está
desligada, e descobrem a seção com `SECOES.find(s => s.modulosPermissao.includes(key))` — que
devolve a **primeira** da lista. Para `pedidos`, a primeira é `hoje` (`secoes.ts:65`), não
`pipeline` (`:67`). Como `hoje` nasce **desligada** no preset padrão, **as 7 empresas fora da MD
perdem a linha "Negócios" da matriz de permissões** — o módulo central do produto, que não dá
para configurar nem por pessoa nem por preset. É bug de hoje, e a chave nova herdaria o mesmo
esconderijo.

- [ ] **Passo 1: escrever o teste primeiro, em `src/lib/secoes.test.ts`**

```ts
import { secaoQueMandaNoModulo } from './secoes';

describe('secaoQueMandaNoModulo', () => {
  /**
   * 🔴 `pedidos` é citado por DUAS seções: `hoje` (desligável, e desligada em 7 das 8 empresas)
   * e `pipeline` (não desligável). Quem decide se a linha aparece na matriz de permissões tem
   * que ser a NÃO desligável — senão o módulo Negócios some da tela de quem não tem a pauta.
   */
  it('devolve a seção não desligável quando duas citam o mesmo módulo', () => {
    expect(secaoQueMandaNoModulo('pedidos')?.id).toBe('pipeline');
  });

  it('devolve a única seção quando só uma cita o módulo', () => {
    expect(secaoQueMandaNoModulo('obras')?.id).toBe('obras');
    expect(secaoQueMandaNoModulo('portal')?.id).toBe('portal');
  });

  it('devolve indefinido para módulo que nenhuma seção cita', () => {
    expect(secaoQueMandaNoModulo('modulo_que_nao_existe')).toBeUndefined();
  });
});
```

- [ ] **Passo 2: rodar e ver FALHAR**

```bash
npx vitest run src/lib/secoes.test.ts
```
Esperado: FALHA — `secaoQueMandaNoModulo` não existe.

- [ ] **Passo 3: implementar, no fim de `src/lib/secoes.ts`**

```ts
/**
 * Qual seção decide se este módulo aparece na matriz de permissões.
 *
 * 🔴 Existe porque `SECOES.find(...)` devolvia a PRIMEIRA da lista, e `pedidos` é citado por
 * duas: `hoje` (desligável) vem antes de `pipeline` (não desligável). Como `hoje` nasce
 * desligada no preset padrão, o módulo **Negócios** — o central do produto — sumia da tela de
 * permissões das 7 empresas que não têm a pauta, sem ninguém perceber.
 *
 * A regra é: quando mais de uma seção cita o módulo, manda a que NÃO pode ser desligada. Ela é
 * a que representa o acesso de verdade; a desligável é um recorte a mais em cima do mesmo dado.
 */
export function secaoQueMandaNoModulo(moduloKey: string): Secao | undefined {
  const candidatas = SECOES.filter((s) => s.modulosPermissao.includes(moduloKey));
  return candidatas.find((s) => !s.desligavel) ?? candidatas[0];
}
```

- [ ] **Passo 4: rodar e ver PASSAR**

```bash
npx vitest run src/lib/secoes.test.ts
```
Esperado: todos passando.

- [ ] **Passo 5: usar nos dois componentes**

Em `PermissaoMatrizChecklist.tsx:71`, trocar
`const secao = SECOES.find(s => s.modulosPermissao.includes(linha.key));`
por
`const secao = secaoQueMandaNoModulo(linha.key);`

Em `PermissaoMatrixEditor.tsx:104`, a mesma troca com `m.key`. Ajustar os imports: sai `SECOES`
(se não for mais usado no arquivo), entra `secaoQueMandaNoModulo`.

- [ ] **Passo 6: provar na tela, numa empresa QUE NÃO É A MD**

Entrar em Configurações → Usuários e permissões, escolher um vendedor de uma empresa sem a seção
"Hoje", e conferir que a linha **Negócios** aparece na matriz. Antes deste conserto ela não
aparecia.

- [ ] **Passo 7: conferir e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31
npx vitest run
git status --short
git add src/lib/secoes.ts src/lib/secoes.test.ts src/components/configuracoes/PermissaoMatrizChecklist.tsx src/components/configuracoes/PermissaoMatrixEditor.tsx
git commit -m "fix(permissoes): modulo Negocios volta a aparecer na matriz das empresas sem a secao Hoje"
```

---

## Tarefa 2 — A chave no catálogo e um interruptor onde o gestor a alcance

**Arquivos:**
- Modificar: `src/hooks/use-permissoes.ts:112-118` (funcionalidades de `pedidos`)
- Modificar: `src/components/configuracoes/PermissaoMatrizChecklist.tsx`

**Interfaces:**
- Produz: a chave `'pauta_de_todos'` dentro de `MODULOS.pedidos.funcionalidades`.

**O problema que isto resolve:** a tela de permissões **por pessoa** só desenha as quatro caixas
de ver/criar/editar/excluir. Funcionalidade fina só existe no editor de **presets**, e aplicar um
preset reescreve todas as permissões da pessoa. Sem um interruptor aqui, a chave nasce
inalcançável — foi exatamente o que aconteceu com `ver_metas_vendedor`, que uma migration promete
ser concedida "à mão na tela, pessoa a pessoa", numa porta que não existe.

- [ ] **Passo 1: acrescentar a chave ao catálogo**

Em `src/hooks/use-permissoes.ts`, dentro de `funcionalidades` do módulo `pedidos` (`:112`):

```ts
      {
        key: 'pauta_de_todos',
        label: 'Ver a pauta de toda a equipe',
        descricao: 'Na tela "Hoje", ver e agir sobre os negócios dos colegas, não só os próprios',
        icon: 'users',
      },
```

- [ ] **Passo 2: desenhar o interruptor na matriz por pessoa**

Em `PermissaoMatrizChecklist.tsx`, abaixo da linha do módulo, desenhar as funcionalidades que
importam. Para não inchar a tela com as 20 chaves existentes, desenhe **só as marcadas como
destaque** — comece por uma lista explícita:

```tsx
// Funcionalidades que o gestor precisa alcançar pessoa a pessoa. As demais continuam só no
// editor de presets — esta tela é uma matriz de leitura rápida, não um formulário completo.
const FUNCIONALIDADES_NA_MATRIZ: Record<string, string[]> = {
  pedidos: ['pauta_de_todos'],
};
```

E, dentro do laço que desenha cada linha de módulo, logo depois das quatro caixas:

```tsx
{(FUNCIONALIDADES_NA_MATRIZ[linha.key] ?? []).map((chaveFunc) => {
  const modulo = MODULOS.find((m) => m.key === linha.key);
  const func = modulo?.funcionalidades.find((f) => f.key === chaveFunc);
  if (!func) return null;
  const ligada = getValue(linha.key).funcionalidades?.[chaveFunc] === true;
  return (
    <div key={chaveFunc} className="col-span-5 flex items-center gap-2 pl-6 pt-1">
      <Switch
        checked={ligada}
        onCheckedChange={(v) =>
          onChange(linha.key, {
            funcionalidades: { ...(getValue(linha.key).funcionalidades ?? {}), [chaveFunc]: v },
          })
        }
      />
      <span className="text-xs text-muted-foreground">{func.label}</span>
    </div>
  );
})}
```

⚠️ **Confirme antes de escrever** que `getValue`/`onChange` carregam `funcionalidades` no tipo
`MatrixModuloValue` (`PermissaoMatrixEditor.tsx:16-22`). Se não carregarem, acrescente o campo lá
primeiro — os dois componentes dividem esse contrato.

- [ ] **Passo 3: conferir e provar na tela**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31
npx vitest run && npx vite build
```

Na tela, como gestor: Configurações → Usuários e permissões → um vendedor → Permissões. O
interruptor "Ver a pauta de toda a equipe" aparece sob a linha Negócios, e ligar/desligar grava
sozinho (a tela não tem botão Salvar; ela grava a cada clique).

Confira no banco que gravou:

```sql
select funcionalidades from public.permissoes_usuario
 where usuario_id = '<usuarios.id do vendedor>' and modulo = 'pedidos';
```
Esperado: `{"pauta_de_todos": true, ...}`.

- [ ] **Passo 4: commitar**

```bash
git status --short
git add src/hooks/use-permissoes.ts src/components/configuracoes/PermissaoMatrizChecklist.tsx
git commit -m "feat(permissoes): chave pauta_de_todos no catalogo e alcancavel pessoa a pessoa"
```

---

## Tarefa 3 — A chave nos presets, com backfill

**Arquivos:**
- Criar: `supabase/migrations/20260905130000_pauta_de_todos_nos_presets.sql`

**Por que separado da Tarefa 4:** este arquivo mexe em **permissão gravada**; o outro mexe em
**função com privilégio**. São riscos diferentes, e separar deixa voltar atrás em um sem desfazer
o outro.

🔴 **Se a lista `VALUES` da função de presets ficar desatualizada, qualquer preset vira um
revogador.** `useApplyPermissaoPreset` percorre o catálogo do NAVEGADOR e grava
`pode_ver: p?.pode_ver ?? false` para cada módulo — módulo que existe no navegador e não no
preset é gravado como "não pode ver". Foi assim que, entre 24 e 31/08/2026, o preset "Total"
passou a **tirar** o Plano de Vendas de quem o recebia. Como aqui a chave é uma *funcionalidade* e
não um módulo, o erro equivalente fecha para o lado seguro — mas a lista precisa ser reemitida
mesmo assim, senão o preset apaga a chave de quem a tinha.

Por decisão 9 do dono do produto, a chave **entra** nos ramos `total` e `operacional` — ao
contrário de `ver_metas_vendedor`, que fica de fora dos dois.

- [ ] **Passo 1: colher o texto vigente ANTES de escrever**

```sql
select pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='montar_permissoes_preset_padrao';
```
Copie o corpo. A migration parte **deste texto**, não do arquivo do repositório — o banco já
divergiu do repositório neste projeto antes.

- [ ] **Passo 2: escrever a migration**

```sql
-- ============================================================================
-- A CHAVE `pauta_de_todos` ENTRA NOS PRESETS DE PERMISSÃO
-- ============================================================================
--
-- `pauta_de_todos` decide, na tela "Hoje", se a pessoa vê e age sobre os negócios de toda a
-- equipe ou só sobre os próprios.
--
-- 🔴 REEMITIR A FUNÇÃO INTEIRA é obrigatório, não estilo. `useApplyPermissaoPreset` percorre o
-- catálogo do NAVEGADOR e grava o que não achar no preset como "não pode". Chave que existe lá
-- e não aqui é APAGADA de quem a tinha no primeiro clique em qualquer preset.
--
-- Por decisão do dono do produto (05/09/2026), a chave entra em 'total' e 'operacional' — ao
-- contrário de `ver_metas_vendedor`, que continua fora de todos. O efeito aceito: um clique em
-- lote passa a abrir a carteira da equipe para quem receber esses dois presets.
--
-- Roda duas vezes sem estrago.
-- ============================================================================

BEGIN;

-- (a) A função: mesma da versão vigente, com 'pauta_de_todos' na lista de `pedidos`.
--     🔴 Cole aqui o corpo colhido no Passo 1, trocando SÓ a linha de `pedidos` por:
--        ('pedidos', '["importar","exportar_pdf","alterar_status","whatsapp","mover_cards","filtrar_avancado","pauta_de_todos"]'::jsonb)
--     e mantendo `ver_metas_vendedor` nas duas listas de exceção como está.

-- (b) Backfill: reescrever a função NÃO alcança os presets já gravados nas 8 empresas.
--     Acréscimo cirúrgico, no molde da 20260831200000 — preserva qualquer customização.
update public.permissao_presets p
   set permissoes = jsonb_set(
         p.permissoes,
         '{pedidos,funcionalidades,pauta_de_todos}',
         to_jsonb(p.preset_key in ('total', 'operacional')),
         true
       )
 where p.origem = 'padrao'
   and p.permissoes ? 'pedidos'
   and not (p.permissoes -> 'pedidos' -> 'funcionalidades' ? 'pauta_de_todos');

COMMIT;

-- Confira depois de rodar — os 4 presets de cada empresa, e o valor da chave em cada um:
--
--   select e.nome, p.preset_key,
--          p.permissoes -> 'pedidos' -> 'funcionalidades' -> 'pauta_de_todos' as chave
--     from public.permissao_presets p join public.empresas e on e.id = p.empresa_id
--    where p.origem = 'padrao' order by 1, 2;
--
-- Esperado: 'total' e 'operacional' = true; 'leitura' e 'nenhum' = false. Nenhum nulo.
```

- [ ] **Passo 3: aplicar e conferir no banco**

Rode a consulta do rodapé da migration. Se algum vier **nulo**, o `jsonb_set` não achou o caminho
— provavelmente aquele preset não tem o bloco `pedidos.funcionalidades`. Pare e trate o caso antes
de seguir.

- [ ] **Passo 4: commitar**

```bash
git status --short
git add supabase/migrations/20260905130000_pauta_de_todos_nos_presets.sql
git commit -m "feat(permissoes): pauta_de_todos entra nos presets, com backfill das 8 empresas"
```

---

## Tarefa 4 — A pauta passa a decidir o alcance

**Arquivos:**
- Criar: `supabase/migrations/20260905140000_pauta_ampliada.sql`
- Modificar: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produz: `pauta_do_dia()` devolvendo uma coluna a mais, `responsavel text`.

🔴 **Acrescentar coluna ao retorno obriga `DROP` + `CREATE` — e o `DROP` apaga a revogação.**
Conferido: `pauta_do_dia_de(uuid)` hoje tem permissão só para `postgres` e `service_role` — o
navegador **não** pode chamá-la. Recriar sem reemitir o `REVOKE` devolve a pauta dos colegas a
qualquer pessoa logada, em silêncio.

- [ ] **Passo 1: colher o corpo vigente das DUAS funções**

```sql
select p.proname, pg_get_functiondef(p.oid),
       coalesce(array_to_string(p.proacl,' | '),'(padrao)') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('pauta_do_dia','pauta_do_dia_de');
```
Guarde as duas permissões — elas vão de volta no fim da migration.

- [ ] **Passo 2: escrever a migration**

```sql
-- ============================================================================
-- A PAUTA DECIDE O ALCANCE: OS PRÓPRIOS OU OS DE TODA A EQUIPE
-- ============================================================================
--
-- Quem tem a chave `pauta_de_todos` passa a ver, na fila de "Hoje", os negócios de toda a
-- empresa, com o nome do dono. Sem a chave, continua vendo só os próprios.
--
-- 🔴 A LEITURA DA CHAVE NÃO PODE USAR `has_funcionalidade`. Ela responde "pode" para gestor,
-- admin e empresa SEM OLHAR A LINHA — e a decisão 2 do dono do produto diz que o gestor pode
-- ser configurado pessoa a pessoa. Lemos a configuração direto, com o papel entrando só como
-- PADRÃO na ausência dela.
--
-- 🔴 `pedidos` NÃO TEM COLUNA DE EMPRESA. O recorte por empresa passa por `usuarios`. Sem ele,
-- esta função — que roda com privilégio — mostraria negócio de outra empresa. Não dá erro:
-- simplesmente vaza.
--
-- 🔴 O `DROP` ABAIXO APAGA A REVOGAÇÃO de `pauta_do_dia_de`, que hoje impede o navegador de
-- chamá-la direto. Ela é reemitida no fim deste arquivo. Sem isso, qualquer pessoa logada
-- conseguiria pedir a pauta de qualquer colega, passando um identificador.
--
-- Os COMPROMISSOS continuam pessoais: agenda e tarefa do gestor são dele. Só os negócios se
-- ampliam. E eles continuam consumindo vaga no teto de itens.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pauta_do_dia();
DROP FUNCTION IF EXISTS public.pauta_do_dia_de(uuid);

CREATE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text,
              valor numeric, quando timestamptz, dias_parado integer, ordem integer,
              responsavel text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid; v_auth uuid; v_dias int; v_min int; v_max int;
  v_hoje date; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;

  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- A chave, lida direto. Papel só como padrão. Ver o comentário do cabeçalho.
  select coalesce(
    (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
       from permissoes_usuario pu
      where pu.usuario_id = p_usuario_id and pu.modulo = 'pedidos'
        and pu.funcionalidades ? 'pauta_de_todos'),
    (select u.role in ('gestor','admin','empresa') from usuarios u where u.id = p_usuario_id)
  ) into v_ve_todos;

  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_min_itens'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_min, v_max;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  ) q;

  v_vagas := greatest(v_max - v_compromissos, 0);

  return query
  with
  -- 🔴 A cerca de empresa. `pedidos` não tem empresa_id; ela vem por aqui.
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
       and (v_ve_todos or u.id = p_usuario_id)
  ),
  etapas_abertas as (
    select distinct k.slug from kanban_colunas k
     where k.empresa_id = v_empresa and k.slug not in ('fechamento','perdido')
  ),
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
     group by hc.pedido_id
  ),
  candidatos as (
    select p.id,
      coalesce(nullif(trim(p.nome),''),
               nullif(trim(p.campos_extras ->> 'Negócio'),''),
               nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
               'Negócio sem nome')                              as titulo,
      coalesce(k.nome, p.status)                                as etapa_label,
      p.data_pedido,
      coalesce(p.valor_total,0)                                 as valor,
      (v_hoje - (ue.em at time zone 'America/Sao_Paulo')::date) as dias_parado,
      du.nome                                                   as dono,
      (p.usuario_id = p_usuario_id)                             as e_meu
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    where p.status in (select slug from etapas_abertas)
      and (r.ate is null or r.ate < v_hoje)
  ),
  ranqueados as (
    select c.*, row_number() over (order by c.dias_parado desc, c.valor desc) as posicao
    from candidatos c
  ),
  negocios as (
    select r.* from ranqueados r
    where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)
    order by r.valor desc, r.dias_parado desc
    limit v_vagas
  ),
  compromissos as (
    select e.id, e.titulo,
           coalesce(nullif(trim(e.descricao),''),'Compromisso na agenda') as detalhe,
           e.inicio as quando
      from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select t.id, t.titulo,
           coalesce(nullif(trim(t.descricao),''),'Tarefa com prazo hoje') as detalhe,
           t.prazo_final as quando
      from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  )
  select 'compromisso'::text, cp.id, 'Hoje'::text, cp.titulo, cp.detalhe,
         null::numeric, cp.quando, null::integer,
         (row_number() over (order by cp.quando))::integer, null::text
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (1000 + row_number() over (order by n.valor desc))::integer,
         -- Só quando NÃO é meu: escrever o próprio nome em todo item viraria ruído.
         case when n.e_meu then null else n.dono end
  from negocios n
  order by 9;
end;
$function$;

CREATE FUNCTION public.pauta_do_dia()
RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text,
              valor numeric, quando timestamptz, dias_parado integer, ordem integer,
              responsavel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select * from public.pauta_do_dia_de(get_my_usuario_id());
$function$;

-- 🔴 A revogação volta. O DROP acima a apagou. Sem esta linha, qualquer pessoa logada pede a
-- pauta de qualquer colega passando o identificador dele.
REVOKE ALL ON FUNCTION public.pauta_do_dia_de(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pauta_do_dia_de(uuid) TO service_role;

COMMIT;

-- Confira depois de rodar — a revogação TEM que estar de volta:
--
--   select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
-- Esperado: `pauta_do_dia_de(uuid)` SEM `authenticated=X`. Se aparecer, refaça o REVOKE.
```

- [ ] **Passo 3: ensaiar ANTES de aplicar, numa transação desfeita**

`CREATE OR REPLACE FUNCTION` é transacional no Postgres — dá para aplicar, medir e desfazer.
Rode o corpo da migration dentro de `begin; ... ` e, **antes do commit**, meça:

```sql
-- Um vendedor sem a chave: tem que continuar vendo só os próprios.
select count(*), count(*) filter (where responsavel is not null) as de_outros
  from public.pauta_do_dia_de('<usuarios.id de um vendedor da MD>');
-- Esperado: de_outros = 0

-- Um gestor: passa a ver de outros.
select responsavel, count(*)
  from public.pauta_do_dia_de('<usuarios.id de um gestor da MD>') group by 1;

rollback;
```

- [ ] **Passo 4: aplicar, e conferir a revogação no banco**

Rode a consulta do rodapé da migration. 🔴 Se `authenticated=X` aparecer para
`pauta_do_dia_de(uuid)`, **refaça o REVOKE imediatamente** — é vazamento aberto.

- [ ] **Passo 5: declarar em `types.ts` e no tipo do hook**

Em `src/integrations/supabase/types.ts`, acrescentar `responsavel: string | null` ao `Returns` de
`pauta_do_dia`. Em `src/hooks/use-pauta.ts:17-27`, acrescentar à interface `ItemDaPauta`:

```ts
  /** Nome do dono, só quando o negócio NÃO é de quem está olhando. */
  responsavel: string | null;
```

- [ ] **Passo 6: commitar**

```bash
git status --short
git add supabase/migrations/20260905140000_pauta_ampliada.sql src/integrations/supabase/types.ts src/hooks/use-pauta.ts
git commit -m "feat(hoje): a pauta decide o alcance pela chave, com a cerca de empresa e a revogacao de volta"
```

---

## Tarefa 4b — O e-mail das 7h diz de quem é o negócio

**Arquivos:**
- Modificar: `supabase/functions/pauta-resumo-diario/index.ts:100-115`

**Interfaces:**
- Consome: a coluna `responsavel` que a Tarefa 4 acrescentou ao retorno de `pauta_do_dia_de`.

🔴 **Esta tarefa é obrigatória, e é fácil esquecer.** O e-mail está **ligado** na MD, de segunda a
sexta, e usa a MESMA função da tela. Depois da Tarefa 4 o gestor passa a receber negócios de
outras pessoas — e o corpo do e-mail lê só `titulo`, `detalhe` e `valor`. Sem esta tarefa, ele
recebe uma lista de negócios que não são dele **sem nenhuma indicação disso**, e vai cobrar a
pessoa errada.

🔴 **Função de servidor é OUTRO caminho de publicação.** O `git push` publica o site; a função
sobe à parte, pelo comando do Passo 3. Commitar sem publicar (ou o contrário) deixa código e
produção divergentes sem aviso (CLAUDE.md §16).

- [ ] **Passo 1: mostrar o dono no item do e-mail**

Em `supabase/functions/pauta-resumo-diario/index.ts`, onde o item é montado (`:112-113`),
acrescentar o dono ao detalhe quando ele vier preenchido:

```ts
        .replaceAll("ITEM_TITULO", esc(i.titulo))
        // `responsavel` só vem quando o negócio NÃO é de quem recebe o e-mail — a função de
        // banco já resolve isso. Sem esta linha, o gestor recebe negócio de colega sem saber
        // de quem é, e cobra a pessoa errada.
        .replaceAll(
          "ITEM_DETALHE",
          esc(i.responsavel ? `${i.detalhe} · ${i.responsavel}` : i.detalhe),
        );
```

- [ ] **Passo 2: conferir que o tipo do item aceita o campo**

Se o arquivo declara uma interface para o item da pauta, acrescente `responsavel?: string | null`.
Se ele lê de `any`, deixe como está — mas confira que `i.responsavel` não quebra o `esc()` quando
vem nulo (o `?` acima já protege).

- [ ] **Passo 3: publicar a função, a partir da pasta do projeto**

```bash
npx supabase functions deploy pauta-resumo-diario --project-ref hukeirrmsoiowvvrhivx
```

Conferir que a versão subiu:

```sql
-- Ou pelo painel; o que importa é a versão ter mudado depois deste deploy.
```

- [ ] **Passo 4: provar sem esperar as 7h**

Invocar a função à mão e conferir o corpo gerado para um gestor e para um vendedor. O do vendedor
**não** pode ter nome de responsável em item nenhum.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add supabase/functions/pauta-resumo-diario/index.ts
git commit -m "feat(pauta): o e-mail diario diz de quem e o negocio quando nao e de quem recebe"
```

---

## Tarefa 5 — Adiar negócio de colega, e avisar o dono

**Arquivos:**
- Criar: `supabase/migrations/20260905150000_adiar_negocio_de_colega.sql`
- Modificar: `src/hooks/use-pauta.ts:60-86` (`useRegistrarRetorno`)

**Interfaces:**
- Produz: função de banco `registrar_retorno(p_pedido_id uuid, p_motivo text, p_retorno_em date)`,
  chamada pelo navegador no lugar do `insert` direto.

**Dois fatos conferidos que obrigam a este desenho:**

- `historico_contatos_insert` aceita `p.usuario_id = get_my_usuario_id() OR (is_gestor() AND ...)`.
  Um vendedor **com a chave** teria o botão e o clique seria recusado — pior que não ter o botão.
- `notificacoes_insert` exige `is_gestor()`. O aviso **não pode sair do navegador** de quem não é
  gestor.

- [ ] **Passo 1: escrever a migration**

```sql
-- ============================================================================
-- ADIAR O NEGÓCIO DE UM COLEGA, E AVISAR O DONO
-- ============================================================================
--
-- Decisão do dono do produto (05/09/2026): quem tem a chave `pauta_de_todos` AGE, não só vê.
-- E vale uma verdade só — o adiamento sai da pauta dos dois, e o dono é avisado.
--
-- Duas travas de hoje impediam isso, e as duas estão tratadas aqui:
--   · `historico_contatos_insert` só aceitava dono OU gestor;
--   · `notificacoes_insert` exige `is_gestor()`, então o aviso não pode sair do navegador.
--
-- Por isso o registro passa a ser feito por FUNÇÃO com privilégio: ela confere a permissão,
-- grava o retorno e cria o aviso num gesto só.
-- ============================================================================

BEGIN;

-- Quem pode agir sobre este negócio: o dono, um gestor, ou quem tem a chave — sempre dentro
-- da mesma empresa. Isolada porque a política e a função abaixo precisam da MESMA resposta.
CREATE OR REPLACE FUNCTION public.posso_agir_no_negocio(p_pedido_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from pedidos p
      join usuarios dono on dono.id = p.usuario_id
      join usuarios eu   on eu.id = get_my_usuario_id()
     where p.id = p_pedido_id
       and dono.empresa_id = eu.empresa_id
       and (
         p.usuario_id = eu.id
         or eu.role in ('gestor','admin','empresa')
         or coalesce(
              (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
                 from permissoes_usuario pu
                where pu.usuario_id = eu.id and pu.modulo = 'pedidos'
                  and pu.funcionalidades ? 'pauta_de_todos'),
              false)
       )
  );
$function$;

DROP POLICY IF EXISTS "historico_contatos_insert" ON public.historico_contatos;
CREATE POLICY "historico_contatos_insert" ON public.historico_contatos
  FOR INSERT WITH CHECK (public.posso_agir_no_negocio(pedido_id));

-- Grava o retorno e, quando o negócio é de outra pessoa, avisa o dono. Um gesto só: se o aviso
-- falhasse depois de o retorno ter sido gravado, o negócio sairia da pauta do vendedor em
-- silêncio — exatamente o que a decisão 5 do dono do produto quis evitar.
CREATE OR REPLACE FUNCTION public.registrar_retorno(
  p_pedido_id uuid, p_motivo text, p_retorno_em date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_eu uuid; v_dono uuid; v_meu_nome text; v_titulo text;
begin
  v_eu := get_my_usuario_id();
  if not public.posso_agir_no_negocio(p_pedido_id) then
    raise exception 'Você não pode adiar este negócio.' using errcode = '42501';
  end if;

  select p.usuario_id,
         coalesce(nullif(trim(p.nome),''), 'o negócio')
    into v_dono, v_titulo
  from pedidos p where p.id = p_pedido_id;

  insert into historico_contatos (pedido_id, usuario_id, tipo, descricao, data_contato, proximo_contato_em)
  values (p_pedido_id, v_eu, 'retorno', p_motivo,
          (now() at time zone 'America/Sao_Paulo')::date, p_retorno_em);

  if v_dono is distinct from v_eu then
    select u.nome into v_meu_nome from usuarios u where u.id = v_eu;
    insert into notificacoes (usuario_id, pedido_id, tipo, titulo, mensagem)
    values (v_dono, p_pedido_id, 'retorno_adiado',
            v_meu_nome || ' adiou um negócio seu',
            v_titulo || ' saiu da sua pauta até ' || to_char(p_retorno_em, 'DD/MM/YYYY') ||
            '. Motivo: ' || coalesce(nullif(trim(p_motivo),''), 'sem motivo registrado'));
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.registrar_retorno(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno(uuid, text, date) TO authenticated;

COMMIT;
```

- [ ] **Passo 2: a tela passa a chamar a função**

Em `src/hooks/use-pauta.ts`, trocar o corpo de `mutationFn` de `useRegistrarRetorno` por:

```ts
    mutationFn: async (args: { pedidoId: string; motivo: string; retornoEm: string }) => {
      // Chama a função do servidor, e não o insert direto: ela é quem confere a permissão e
      // cria o aviso ao dono quando o negócio é de outra pessoa. A regra de `notificacoes`
      // exige papel de gestor para inserir, então o aviso não pode sair daqui.
      const { error } = await supabase.rpc('registrar_retorno', {
        p_pedido_id: args.pedidoId,
        p_motivo: args.motivo,
        p_retorno_em: args.retornoEm,
      });
      if (error) throw new Error(mensagemDeErro(error, 'Não foi possível adiar este negócio'));
    },
```

Acrescentar `import { mensagemDeErro } from '@/lib/mensagem-de-erro';` e, ao `onSuccess`,
`qc.invalidateQueries({ queryKey: ['notificacoes'] })`.

⚠️ `profile` deixa de ser usado no `mutationFn` — remova o `useAuth()` se ele não servir mais a
nada no hook, para não deixar variável morta.

- [ ] **Passo 3: declarar em `types.ts`**

Acrescentar `registrar_retorno` e `posso_agir_no_negocio` ao bloco `Functions` de
`src/integrations/supabase/types.ts`. O build não avisa quando falta.

- [ ] **Passo 4: provar os três caminhos**

1. **Vendedor sem a chave, negócio próprio:** adia normalmente, e **nenhum** aviso é criado.
2. **Gestor, negócio de vendedor:** adia; o vendedor recebe o aviso; o negócio some da pauta dos
   dois.
3. **Vendedor sem a chave, negócio de colega:** não deve nem ver o botão (Tarefa 6). Se chamar a
   função à mão, tem que voltar erro 42501 com a frase em português.

```sql
select n.titulo, n.mensagem, u.nome as destinatario
  from public.notificacoes n join public.usuarios u on u.id = n.usuario_id
 where n.tipo = 'retorno_adiado' order by n.created_at desc limit 5;
```
Esperado: o destinatário é o **dono do negócio**, nunca quem adiou.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add supabase/migrations/20260905150000_adiar_negocio_de_colega.sql src/hooks/use-pauta.ts src/integrations/supabase/types.ts
git commit -m "feat(hoje): adiar negocio de colega passa pelo servidor e avisa o dono"
```

---

## Tarefa 6 — A tela mostra o dono, e o filtro de responsável segue a chave

**Arquivos:**
- Modificar: `src/hooks/use-minha-permissao.ts`
- Modificar: `src/pages/Hoje.tsx:31-111` (o item) e `:196` (o painel)
- Modificar: `src/components/pauta/RadarDeRisco.tsx`

**Interfaces:**
- Consome: `ItemDaPauta.responsavel` (Tarefa 4).
- Produz: `usePossoVerPautaDeTodos(): boolean`.

- [ ] **Passo 1: expor a chave no navegador**

Em `src/hooks/use-minha-permissao.ts`, acrescentar:

```ts
/**
 * Se EU vejo a pauta e os números de toda a equipe.
 *
 * Isto é só para a TELA — esconder controle não protege nada. Quem decide de verdade é a função
 * `pauta_do_dia()` no banco, que lê a mesma chave. Aqui serve para não oferecer um filtro que
 * voltaria vazio, e para não mostrar um botão que o servidor vai recusar.
 *
 * O padrão segue o do banco: sem configuração, vale o papel.
 */
export function usePossoVerPautaDeTodos(): boolean {
  const { profile } = useAuth();
  const { data: permissao } = useMinhaPermissao('pedidos');
  const configurada = permissao?.funcionalidades?.pauta_de_todos;
  if (typeof configurada === 'boolean') return configurada;
  return profile?.role === 'gestor' || profile?.role === 'admin' || profile?.role === 'empresa';
}
```

⚠️ Confirme o nome e o formato de retorno de `useMinhaPermissao` antes de escrever — se ele não
expuser `funcionalidades`, use `usePodeFazer` de `use-permissoes.ts`, que aceita a funcionalidade
como terceiro argumento.

- [ ] **Passo 2: o item da pauta mostra de quem é**

Em `src/pages/Hoje.tsx`, dentro de `ItemPauta`, ao lado do valor e do horário (`:65-75`):

```tsx
          {item.responsavel && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {item.responsavel}
            </span>
          )}
```

O campo só vem preenchido quando o negócio **não** é de quem está olhando — escrever o próprio
nome em todo item viraria ruído.

- [ ] **Passo 3: o painel usa a chave, não o papel**

Em `Hoje.tsx`, trocar o cálculo de `ehGestor` da Etapa 2 por `usePossoVerPautaDeTodos()`:

```tsx
  const podeVerDeTodos = usePossoVerPautaDeTodos();
```
e passar `podeFiltrarPorResponsavel={podeVerDeTodos}` ao `RadarDeRisco`.

- [ ] **Passo 4: o portão da lista nominal, no servidor**

A lista por responsável ainda é cortada por `is_gestor()` dentro de
`dashboard_negocios_risco`. Numa migration nova, troque aquele `CASE WHEN is_gestor()` por uma
chamada à mesma leitura de chave usada na pauta. **Não** mude o corte para o navegador — a decisão
tem que continuar no servidor.

```sql
-- Dentro de dashboard_negocios_risco, no lugar de `CASE WHEN is_gestor() THEN`:
CASE WHEN coalesce(
       (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
          from permissoes_usuario pu
         where pu.usuario_id = get_my_usuario_id() and pu.modulo = 'pedidos'
           and pu.funcionalidades ? 'pauta_de_todos'),
       is_gestor()
     ) THEN (
```

Reemita a função inteira, partindo do texto vigente colhido do banco. Como a assinatura **não**
muda desta vez, `create or replace` basta.

- [ ] **Passo 5: conferir e provar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31
npx vitest run && npx vite build
```

Na tela, com um vendedor de teste:

| Estado da chave | Esperado na fila | Esperado no painel |
|---|---|---|
| Desligada | Só os próprios, sem etiqueta de nome | Sem filtro de responsável; gráfico por vendedor ausente |
| Ligada | Negócios de colegas com o nome do dono | Filtro de responsável presente; gráfico por vendedor presente |

E com um **gestor** com a chave **desligada à mão**: tem que voltar a ver só os próprios. É o teste
que prova que a leitura direta funcionou — com `has_funcionalidade` isto seria impossível.

- [ ] **Passo 6: commitar**

```bash
git status --short
git add src/hooks/use-minha-permissao.ts src/pages/Hoje.tsx src/components/pauta/RadarDeRisco.tsx supabase/migrations/<a nova>.sql
git commit -m "feat(hoje): a tela segue a chave, mostra o dono do negocio e libera o filtro de responsavel"
```

---

## Verificação da etapa

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31
npx vitest run && npx vite build
```

**No banco, os três portões:**

```sql
-- 1. A revogação voltou depois do DROP?
select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'pauta_do_dia%';
-- `pauta_do_dia_de(uuid)` NÃO pode ter `authenticated=X`.

-- 2. Os presets têm a chave, com o valor certo?
select e.nome, p.preset_key,
       p.permissoes -> 'pedidos' -> 'funcionalidades' -> 'pauta_de_todos'
  from public.permissao_presets p join public.empresas e on e.id=p.empresa_id
 where p.origem='padrao' order by 1,2;

-- 3. Ninguém vê de outra empresa?
select count(*) from public.pauta_do_dia_de('<usuarios.id de um gestor da MD>') d
  join public.pedidos p on p.id = d.referencia_id
  join public.usuarios u on u.id = p.usuario_id
 where u.empresa_id <> (select empresa_id from public.usuarios where id = '<o mesmo gestor>');
-- Esperado: 0. Qualquer número acima disso é vazamento entre empresas — desfaça a Tarefa 4.
```

**Antes de publicar:** avisar a equipe da MD que o e-mail das 7h do gestor passa a trazer negócios
de outras pessoas.

**Depois de publicar:** no primeiro dia útil, conferir o e-mail recebido pelo gestor e por um
vendedor. O do vendedor **não** pode ter mudado.

---

## O que esta etapa NÃO faz

- Não cria hierarquia gestor↔vendedor. Ela não existe no sistema, e a chave é por pessoa.
- Não muda o teto de itens da pauta nem o critério de ordenação.
- Não cria o campo "motivo de perdido" — fica registrado como trabalho futuro.
- Não conserta o item 60 da dívida técnica (o vazamento do ranking no Dashboard), que é de outra
  tela.
