-- ============================================================================
-- O PRESET DE PERMISSÕES PARA DE TIRAR O PLANO DE VENDAS
-- ============================================================================
--
-- 🔴 CONSERTO DE BUG EM PRODUÇÃO, e ele já disparou duas vezes.
--
-- ─── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- Aplicar um preset não ACRESCENTA permissão: ele REESCREVE a lista inteira.
-- `useApplyPermissaoPreset` (src/hooks/use-permissao-presets.ts:150-166) percorre o catálogo
-- MODULOS do frontend e grava, para cada módulo, `p?.pode_ver ?? false` — ou seja, **módulo que
-- falta no preset vira "não pode ver"**.
--
-- O módulo `plano_vendas` nasceu em 24/08/2026 (migration 20260824240000). Aquela migration
-- semeou o acesso de quem já era gestor, mas NÃO acrescentou o módulo a
-- `montar_permissoes_preset_padrao()`. O catálogo do frontend passou a ter 15 módulos e a
-- função continuou emitindo 13.
--
-- Resultado às avessas: **dar o preset "Total" a alguém TIRA o Plano de Vendas dele.** O pacote
-- mais generoso é justamente o que remove.
--
-- ─── JÁ ACONTECEU, MEDIDO EM 31/08/2026 ─────────────────────────────────────
--
--   Alex, vendedor da MD, em 28/08     "Aplicou preset: Total"  -> plano_vendas pode_ver = false
--   Luanda e Paulo, gestores da         "Aplicou preset: Total"  -> idem, 17:33, dois segundos
--   PR & Cocentino, em 31/08                                        de diferença
--
-- Luanda e Paulo não sentiram: gestor/admin/empresa curto-circuitam por papel
-- (use-permissoes.ts:325 e has_permission linha 2). Quem sente é o VENDEDOR — e o registro do
-- Alex prova que ele sentiu. O caso do Alex não é consertado aqui a pedido do Lucas: era conta
-- de teste.
--
-- ─── POR QUE ACRESCENTAR A CHAVE, E NÃO REGRAVAR OS PRESETS ─────────────────
--
-- O caminho óbvio seria regravar os 40 presets padrão a partir da função. 🔴 NÃO FAÇA ISSO.
--
-- Medido antes de escrever: 1 dos 40 foi editado depois de criado — o "Operacional" da MD
-- Representações, em 04/08/2026, com `portal` desligado. Uma regravação em bloco religaria o
-- Portal para toda a equipe operacional da MD, desfazendo uma decisão deliberada do gestor sem
-- que nada na tela avisasse.
--
-- Por isso o UPDATE abaixo usa `||` (acrescenta a chave) com a guarda `not (permissoes ? ...)`:
-- ele toca EXCLUSIVAMENTE os presets que não conhecem o módulo, e dentro deles acrescenta
-- EXCLUSIVAMENTE a chave nova. Nenhuma outra permissão é reescrita.
-- ============================================================================


-- ─── 1. A fábrica de presets passa a conhecer o Plano de Vendas ────────────
--
-- A função vem inteira porque `create or replace` troca a função toda, e a base é a definição
-- que estava EM PRODUÇÃO em 31/08/2026 (lida com pg_get_functiondef) — não a do arquivo
-- 20260727130000, que já divergiu.
--
-- 🔴 A DIVERGÊNCIA, REGISTRADA PARA NÃO SE PERDER: o arquivo de 27/07 emite um módulo
-- `pipeline` com ["mover_cards","exportar_pdf","filtrar_avancado"]. A função em produção não o
-- emite — essas três funcionalidades foram passadas para dentro de `pedidos`, que hoje tem seis.
-- Foi uma FUSÃO deliberada, feita direto no banco, fora de migration, entre 29 e 31/08/2026.
-- Reproduzo o estado do banco de propósito: desfazer a fusão aqui seria reverter a decisão de
-- alguém sem saber o motivo dela. Fica pendente com o Lucas — e enquanto isso o catálogo do
-- frontend (use-permissoes.ts) continua listando `pipeline` e `pedidos` como dois módulos, o que
-- só não faz estrago porque a permissão `pipeline` não controla tela nenhuma hoje.
--
-- A ordem de `plano_vendas` acompanha a do catálogo do frontend, onde ele vem logo depois do
-- dashboard. Aqui a ordem não muda comportamento (o resultado é um objeto), mas ler os dois
-- lados na mesma sequência é o que torna a próxima divergência visível.
create or replace function public.montar_permissoes_preset_padrao(p_preset_key text)
returns jsonb
language sql
immutable
as $function$
  SELECT jsonb_object_agg(modulo, jsonb_build_object(
    'pode_ver', p_preset_key <> 'nenhum',
    'pode_criar', p_preset_key IN ('operacional', 'total'),
    'pode_editar', p_preset_key IN ('operacional', 'total'),
    'pode_excluir', p_preset_key = 'total',
    -- 🔴 `ver_metas_vendedor` É EXCEÇÃO EM TODOS OS PRESETS, INCLUSIVE NO "TOTAL".
    --
    -- Decisão do Lucas em 31/08/2026, perguntado antes de aplicar. Essa funcionalidade mostra
    -- o RANKING NOMINAL da equipe — quanto cada colega vendeu, com nome. Hoje é exclusiva de
    -- gestor, e nenhum vendedor vê número de colega.
    --
    -- Nenhum preset a concede: nem o "Total". Um preset é um gesto de um clique, aplicado em
    -- lote; abrir o desempenho de toda a equipe para os colegas não pode acontecer como efeito
    -- colateral de "dar acesso máximo a fulano". Quem quiser conceder a alguém específico
    -- continua ligando à mão na tela de permissões — aí é uma decisão, não um descuido.
    --
    -- ⚠️ Consequência de aceitar: aplicar QUALQUER preset depois zera essa concessão manual,
    -- porque preset reescreve o bloco de funcionalidades inteiro. Vale para todo módulo, não é
    -- particularidade deste — mas é o único caso onde o gestor pode ter ligado de propósito.
    --
    -- O `NOT IN` de 'total' não afeta módulo nenhum além do Plano de Vendas: `ver_metas_vendedor`
    -- só existe na lista dele.
    'funcionalidades', CASE
      WHEN p_preset_key = 'total' THEN
        (SELECT jsonb_object_agg(f, f NOT IN ('ver_metas_vendedor'))
         FROM jsonb_array_elements_text(funcs) f)
      WHEN p_preset_key = 'operacional' THEN
        (SELECT jsonb_object_agg(f, f NOT IN ('gerenciar_usuarios', 'gerenciar_permissoes', 'ver_metas_vendedor'))
         FROM jsonb_array_elements_text(funcs) f)
      ELSE '{}'::jsonb
    END
  ))
  FROM (VALUES
    ('dashboard',    '["filtrar_vendedor","exportar_relatorio"]'::jsonb),
    -- 🔴 A LINHA QUE FALTAVA. As duas funcionalidades são os níveis 2 e 3 do Plano de Vendas:
    -- a quebra por fabricante e a quebra nominal por vendedor (migration 20260824240000).
    ('plano_vendas', '["ver_metas_fabrica","ver_metas_vendedor"]'::jsonb),
    ('clientes',     '["importar","exportar","whatsapp"]'::jsonb),
    ('contatos',     '["whatsapp"]'::jsonb),
    ('pedidos',      '["importar","exportar_pdf","alterar_status","whatsapp","mover_cards","filtrar_avancado"]'::jsonb),
    ('obras',        '["alterar_status"]'::jsonb),
    ('fabricantes',  '["importar_precos","gerenciar_precos"]'::jsonb),
    ('portal',       '["importar_licencas"]'::jsonb),
    ('calendario',   '[]'::jsonb),
    ('tarefas',      '["atribuir_responsavel","alterar_status"]'::jsonb),
    ('chat',         '["criar_grupo","enviar_arquivo"]'::jsonb),
    ('whatsapp',     '[]'::jsonb),
    ('emails',       '[]'::jsonb),
    ('configuracoes','["gerenciar_usuarios","gerenciar_permissoes","ver_codigo_acesso"]'::jsonb)
  ) AS m(modulo, funcs);
$function$;


-- ─── 2. Os presets já guardados aprendem o módulo novo ─────────────────────
--
-- A função é a ÚNICA fonte da verdade: em vez de redigitar aqui o que `plano_vendas` vale em
-- cada preset, o valor é lido dela. Duas listas iguais escritas em lugares diferentes é
-- exatamente como este bug nasceu.
--
-- `not (permissoes ? 'plano_vendas')` é a guarda que preserva a customização da MD, e também
-- torna a migration idempotente: rodar de novo não faz nada.
update public.permissao_presets p
   set permissoes = p.permissoes
                 || jsonb_build_object(
                      'plano_vendas',
                      public.montar_permissoes_preset_padrao(p.preset_key) -> 'plano_vendas'
                    )
 where p.origem = 'padrao'
   and not (p.permissoes ? 'plano_vendas');


comment on function public.montar_permissoes_preset_padrao(text) is
  'Monta o conteúdo dos presets padrão de permissão. 🔴 A lista de módulos aqui precisa bater '
  'com o catálogo MODULOS de src/hooks/use-permissoes.ts: aplicar um preset REESCREVE todas as '
  'permissões da pessoa, e módulo que falta nesta lista é gravado como "não pode ver". Foi '
  'assim que o preset "Total" passou a TIRAR o Plano de Vendas de quem o recebia, entre '
  '24 e 31/08/2026. Ao criar módulo novo no frontend, acrescente-o aqui na mesma migration.';
