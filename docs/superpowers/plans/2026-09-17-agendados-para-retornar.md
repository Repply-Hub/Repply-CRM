# Faixa "Agendados para retornar" — Plano de Implementação

> **Para quem executa:** REQUIRED SUB-SKILL: `subagent-driven-development` ou `executing-plans`.
> Passos com `- [ ]`. Etapas que tocam produção (aplicar migration) param e pedem o "pode" do Lucas.

**Goal:** Uma faixa recolhível no fim do Radar de Risco listando os negócios adiados por "Retomar
depois", com resumo de engajamento para o gestor e a ação de trazer o negócio de volta.

**Architecture:** Três funções SQL novas (uma lista paginada no padrão `negocios_em_risco_de`, um
resumo no padrão `dashboard_negocios_risco`, e uma `cancelar_retorno` `SECURITY DEFINER` no padrão
`registrar_retorno`); três hooks TanStack Query; um componente `Collapsible` que reaproveita o
estilo da `TabelaDoTime` (mesmos utilitários, sem tocar na `TabelaDoTime`).

**Tech Stack:** Postgres (funções `sql`/`plpgsql`), Supabase CLI (`db query -f`), React + TanStack
Query, Radix `Collapsible`, Vitest.

## Global Constraints (de AGENTS.md / CLAUDE.md e do desenho)

- Nunca editar migration existente; só acrescentar (§6.3). Versão = hora da aplicação; conferir
  colisão no origin antes (memória `versao-de-migration-pode-colidir`).
- Nenhum dado real (nome/valor/id) em arquivo (§6.9) — medir e relatar na conversa.
- `resumo por vendedor` só para quem tem `pauta_de_todos`, **cortado no servidor** (§6.1), como
  `dashboard_negocios_risco` faz com `risco_por_vendedor`.
- `negocios_agendados_de` e a lógica sensível ficam fechadas a `authenticated`; os invólucros
  chamados pelo navegador é que recebem `GRANT`. `CREATE OR REPLACE` só onde a assinatura é nova.
- `.delete()`/exclusão confere contagem; zero linhas não é sucesso (§4.6).
- Aplicar no banco = ensaio + "pode" do Lucas. `cancelar_retorno` **apaga dado** — cuidado extra.
- Ordem de execução: Task 1 (banco, aplicado) antes do fim do Task 3, porque a tela chama as
  funções. Os hooks/componente podem ser escritos e testados antes (mock), mas só funcionam de
  ponta a ponta com o banco aplicado.

## File Structure

- **Criar:** `supabase/migrations/<versão>_agendados_para_retornar.sql` — as 3 funções.
- **Modificar:** `src/integrations/supabase/types.ts` — declarar as 3 funções à mão.
- **Modificar:** `src/hooks/use-dashboard.ts` — `useNegociosAgendados`, `useDashboardAgendados` (+
  tipos `NegocioAgendado`, `DashboardAgendados`).
- **Modificar:** `src/hooks/use-pauta.ts` — `useCancelarRetorno` (inverso de `useRegistrarRetorno`,
  mora junto).
- **Criar:** `src/components/pauta/AgendadosParaRetornar.tsx` — a faixa recolhível + tabela.
- **Modificar:** `src/components/pauta/RadarDeRisco.tsx` — renderizar a faixa no fim.
- **Criar testes:** `src/components/pauta/agendados-para-retornar.test.tsx`,
  `src/hooks/use-cancelar-retorno.test.tsx` (ou dentro de um teste de pauta).
- **NÃO tocar:** `TabelaDoTime.tsx` (reaproveitar só os utilitários: `larguras-de-colunas`,
  `EtiquetaDeTentativa`, o padrão de `Avatar`/`iniciais`).

---

### Task 1: As três funções do banco (migration)

**Files:**
- Create: `supabase/migrations/<versão>_agendados_para_retornar.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces (produz):**
- `negocios_agendados(p_usuario_ids uuid[] DEFAULT NULL, p_fabricante_ids uuid[] DEFAULT NULL, p_funil_id uuid DEFAULT NULL, p_etapas text[] DEFAULT NULL, p_limite int DEFAULT 10, p_deslocamento int DEFAULT 0, p_ordenar_por text DEFAULT 'data_retorno', p_ascendente boolean DEFAULT true)` → `TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, data_retorno date, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text, tentativas integer)`
- `dashboard_agendados(p_usuario_ids uuid[] DEFAULT NULL, p_fabricante_ids uuid[] DEFAULT NULL, p_funil_id uuid DEFAULT NULL, p_etapas text[] DEFAULT NULL)` → `TABLE(qtd_total bigint, valor_total numeric, agendados_por_vendedor jsonb)`
- `cancelar_retorno(p_pedido_id uuid)` → `TABLE(retornos_removidos int, tarefas_removidas int)`

- [ ] **Passo 1: Colher os templates vivos** para um arquivo (não redigitar): `pg_get_functiondef`
  de `negocios_em_risco_de`, `negocios_em_risco`, `dashboard_negocios_risco` e `registrar_retorno`
  via `db query --output-format json` (memória `ensaio-de-migration-em-producao`).

- [ ] **Passo 2: `negocios_agendados_de`** — a partir do template `negocios_em_risco_de`:
  - Na CTE `abertos`, trocar o cálculo de risco por: manter só os que têm retorno futuro e trazer a
    data. Acrescentar coluna
    ```sql
    (SELECT max(hc.proximo_contato_em) FROM public.historico_contatos hc
      WHERE hc.pedido_id = p.id AND hc.tipo = 'retorno'
        AND hc.proximo_contato_em >= (SELECT d FROM hoje)) AS data_retorno
    ```
  - Trocar a CTE `marcado`/`meus` por um filtro único:
    ```sql
    meus AS (
      SELECT * FROM abertos a
      WHERE a.data_retorno IS NOT NULL
        AND ((SELECT public.ve_pauta_de_todos(p_usuario_id)) OR a.usuario_id = p_usuario_id)
    )
    ```
  - Saída: trocar `dias_parado`/`parado_desde` por `data_retorno`; manter `nome_exibido`,
    `fabricante_nome`, `etapa_label`, `vendedor_nome`/`_avatar`, `valor_total`, `tentativas`,
    `total_geral`, `valor_geral` (o "valor guardado" = `sum(valor_total) OVER ()`).
  - `ORDER BY` por lista branca (§7.9), colunas: `valor`, `data_retorno`, `negocio`, `fabricante`,
    `etapa`, `responsavel`; desempate `data_retorno ASC, id`. Teto `LIMIT least(p_limite,100)`.
  - Sem os params `p_dias_parado`/`p_data_de`/`p_data_ate` (não fazem sentido aqui).
  - `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;` (fechada).

- [ ] **Passo 3: `negocios_agendados` (invólucro)** — a partir de `negocios_em_risco`: chama
  `negocios_agendados_de(get_my_usuario_id(), ...)`, reordena a página pela mesma lista branca,
  devolve as mesmas colunas. `GRANT EXECUTE TO authenticated` (não `anon`).

- [ ] **Passo 4: `dashboard_agendados`** — a partir de `dashboard_negocios_risco`:
  - `abertos` = negócios abertos da empresa com `data_retorno` futuro (mesmo `EXISTS` do Passo 2),
    respeitando `(eu_vejo_pauta_de_todos() OR usuario_id = get_my_usuario_id())`.
  - Saída:
    ```sql
    SELECT
      (SELECT count(*) FROM abertos)::bigint AS qtd_total,
      (SELECT coalesce(sum(valor_total),0) FROM abertos)::numeric AS valor_total,
      CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
        SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
        FROM (SELECT vendedor_nome, count(*) qtd, sum(valor_total) total
              FROM abertos WHERE vendedor_nome IS NOT NULL GROUP BY vendedor_nome) v
      ) ELSE '[]'::jsonb END;
    ```
  - `GRANT` a `anon`/`authenticated`/`service_role` (lida pelo navegador).

- [ ] **Passo 5: `cancelar_retorno(p_pedido_id uuid)`** — a partir de `registrar_retorno`:
  ```sql
  CREATE OR REPLACE FUNCTION public.cancelar_retorno(p_pedido_id uuid)
  RETURNS TABLE(retornos_removidos int, tarefas_removidas int)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
  declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_r int; v_t int;
          v_datas date[];
  begin
    if not public.empresa_plano_ativo() then
      raise exception 'O acesso da sua empresa está bloqueado.' using errcode='42501';
    end if;
    if not public.posso_agir_no_negocio(p_pedido_id) then
      raise exception 'Você não pode alterar este negócio.' using errcode='42501';
    end if;
    -- as datas dos retornos futuros a desfazer (para casar a tarefa certa)
    select array_agg(distinct hc.proximo_contato_em)
      into v_datas
      from public.historico_contatos hc
     where hc.pedido_id = p_pedido_id and hc.tipo = 'retorno'
       and hc.proximo_contato_em >= v_hoje;
    delete from public.historico_contatos hc
     where hc.pedido_id = p_pedido_id and hc.tipo = 'retorno'
       and hc.proximo_contato_em >= v_hoje;
    get diagnostics v_r = row_count;
    -- a tarefa que o "Retomar depois" criou: titulo 'Retomar contato %', aberta, prazo na data do retorno
    delete from public.tarefas t
     where t.pedido_id = p_pedido_id and coalesce(t.status,'') <> 'concluida'
       and t.titulo like 'Retomar contato %'
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = any(v_datas);
    get diagnostics v_t = row_count;
    if v_r = 0 then
      raise exception 'Não havia agendamento futuro para desfazer neste negócio.' using errcode='P0001';
    end if;
    return query select v_r, v_t;
  end $fn$;
  REVOKE ALL ON FUNCTION public.cancelar_retorno(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.cancelar_retorno(uuid) TO authenticated;
  ```
  (Envolver as 5 funções num `BEGIN;`…`COMMIT;`; `pglast` para conferir a sintaxe.)

- [ ] **Passo 6: `types.ts`** — declarar as 3 funções em `Functions` (Args + Returns), à mão.

- [ ] **Passo 7: Ensaio (GATED — "pode ensaiar")** — `db query -f` numa transação que termina em
  `RAISE`: cria as 3 funções; mede `dashboard_agendados()` e `negocios_agendados()` impersonando um
  gestor da MD (claims+role, memória do ensaio); confere resumo por vendedor `[]` para quem não tem
  a chave; roda `cancelar_retorno` num pedido de teste com retorno futuro e confere
  `retornos_removidos>0` e que a `tentativa` daquele negócio caiu 1; tudo desfeito no RAISE.

- [ ] **Passo 8: Aplicar (GATED — "pode aplicar")** — `db query -f`; registrar em
  `schema_migrations` (md5 = arquivo); verificar no ar (defs, ACLs, números).

---

### Task 2: Tipos e hooks

**Files:**
- Modify: `src/hooks/use-dashboard.ts`, `src/hooks/use-pauta.ts`
- Test: `src/hooks/use-cancelar-retorno.test.tsx`

**Interfaces:**
- Consome: as 3 funções do Task 1 (nomes/params acima).
- Produz: `useNegociosAgendados(empresaId, filtros, quantos)`, `useDashboardAgendados(empresaId, filtros)`,
  `useCancelarRetorno()` (mutação `{ pedidoId }`).

- [ ] **Passo 1: `use-dashboard.ts`** — `interface NegocioAgendado` (id, nome, fabrica, etapa,
  responsavel, responsavel_id?, responsavel_avatar?, valor, data_retorno, tentativas?, total?) e
  `interface DashboardAgendados` (qtd_total, valor_total, agendados_por_vendedor). Hooks
  `useNegociosAgendados` (espelha `useNegociosEmRisco`: chave `['negocios_agendados', ...]`,
  `.rpc('negocios_agendados', {...})`, total via `total_geral`) e `useDashboardAgendados` (espelha
  `useDashboardNegociosRisco`: chave `['dashboard_agendados', ...]`).

- [ ] **Passo 2: `use-pauta.ts` — `useCancelarRetorno`** (inverso de `useRegistrarRetorno`):
  `supabase.rpc('cancelar_retorno', { p_pedido_id })`; sobe o erro cru (a tela traduz); `onSuccess`
  invalida `['pauta-do-dia']`, `['dashboard_negocios_risco']`, `['negocios_em_risco']`,
  `['dashboard_agendados']`, `['negocios_agendados']`, `['tarefas']`, `['tarefas_por_pedido']`,
  `['historico_contatos']`, `['contatos-calendario']`, `['notificacoes']`.

- [ ] **Passo 3: Teste (RED→GREEN)** de `useCancelarRetorno`: monta o hook com um mock de
  `supabase.rpc` e prende que chama `'cancelar_retorno'` com `{ p_pedido_id }` e que invalida as
  chaves acima (o mesmo estilo do teste de `useRegistrarRetorno`, se houver; senão, um teste do
  contrato do `rpc`). `npx vitest run <arquivo>` FALHA antes, PASSA depois.

- [ ] **Passo 4:** `tsc` na base, `vitest` do arquivo verde.

---

### Task 3: A faixa recolhível e a integração no Radar

**Files:**
- Create: `src/components/pauta/AgendadosParaRetornar.tsx`
- Modify: `src/components/pauta/RadarDeRisco.tsx`
- Test: `src/components/pauta/agendados-para-retornar.test.tsx`

**Interfaces:**
- Consome: `useNegociosAgendados`, `useDashboardAgendados`, `useCancelarRetorno`, `usePossoVerPautaDeTodos`,
  `EtiquetaDeTentativa`, `larguras-de-colunas`, `getNomeNegocio`/`iniciais`.
- Produz: `<AgendadosParaRetornar empresaId filtros podeVerDeTodos onAbrir />` renderizado no fim do
  `RadarDeRisco`.

- [ ] **Passo 1: Teste (RED)** `agendados-para-retornar.test.tsx` prendendo o comportamento com
  mock dos hooks: (a) fechada mostra "N negócios" e "R$ ... guardados" e a setinha; (b) sem
  `pauta_de_todos`, NÃO aparece o resumo por vendedor mesmo que o mock mande dados (corte na tela
  além do servidor); (c) abrir revela a tabela com a coluna "Volta em"; (d) o botão "Trazer de
  volta" pede confirmação e só então chama `useCancelarRetorno`. Nomes inventados (§6.9).

- [ ] **Passo 2: `AgendadosParaRetornar.tsx`** — `Collapsible` (`components/ui/collapsible`):
  - `CollapsibleTrigger` = a linha-resumo (usa `useDashboardAgendados`: `qtd_total`, `valor_total`)
    com o `ChevronRight`/`Down`. Se `qtd_total === 0`, mostrar estado vazio discreto.
  - `CollapsibleContent`: se `podeVerDeTodos` e `agendados_por_vendedor.length > 0`, o resumo por
    vendedor no topo; depois a tabela (usa `useNegociosAgendados`), no estilo da `TabelaDoTime`
    (reaproveitando `larguras-de-colunas` com chave própria `..._agendados_v1`, o menu de ordenação,
    o rosto do responsável e a `EtiquetaDeTentativa`), com a coluna **"Volta em"** =
    `formatarDataBR(data_retorno)`. "Ver mais" de 10 em 10.
  - Cada linha: clique abre o negócio (`onAbrir`); botão "Trazer de volta" → `AlertDialog` de
    confirmação → `useCancelarRetorno().mutate({ pedidoId })` → `toast`.

- [ ] **Passo 3: Integrar no `RadarDeRisco.tsx`** — renderizar `<AgendadosParaRetornar ... />`
  DEPOIS do bloco dos gráficos (o último filho), passando `empresaId`, `filtros` (o mesmo recorte),
  `podeVerDeTodos` e `onAbrir` (o mesmo que a `TabelaDoTime` usa para abrir o painel do negócio).

- [ ] **Passo 4: Verificar** — `vitest` do arquivo verde; bateria inteira verde; `tsc` na base;
  `lint` sem erro novo; `build` compila.

---

## Self-Review

- **Cobertura do desenho:** ✅ conjunto (só Retomar depois futuro) → Passo 2/4; onde fica + sanfona
  → Task 3; resumo por vendedor gated no servidor → Passo 4 (`dashboard_agendados`) e reforçado na
  tela (teste b); tabela estilo TabelaDoTime + "Volta em" + tentativas → Task 3; Abrir + Trazer de
  volta com confirmação e apagando retorno+tarefa e devolvendo a tentativa → Passo 5 + Task 3;
  simetria → a mesma coluna `proximo_contato_em >= hoje` decide os dois lados; verificação →
  Passos 7/8 + testes.
- **Placeholders:** as funções do banco vêm de templates vivos + as mudanças exatas mostradas (o
  corpo de `cancelar_retorno` está completo). `<versão>` é a hora da aplicação (Task 1, Passo 8).
- **Consistência de tipos:** as assinaturas do Task 1 batem com o consumo no Task 2 (mesmos nomes de
  params e colunas), e `data_retorno` é `date` em toda a cadeia (banco → hook → "Volta em").
