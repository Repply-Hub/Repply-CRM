-- ============================================================================
-- A CHAVE `pauta_de_todos` ENTRA NOS PRESETS DE PERMISSÃO
-- ============================================================================
--
-- `pauta_de_todos` decide, na tela "Hoje", se a pessoa vê e age sobre os negócios de toda a
-- equipe ou só sobre os próprios. A Tarefa 2 (commit a26a5fc9) criou a chave no catálogo do
-- frontend e o interruptor pessoa a pessoa; esta migration é o que falta para o gestor
-- conceder a mesma coisa em lote, pelos presets "Nenhum / Leitura / Operacional / Total".
--
-- 🔴 REEMITIR A FUNÇÃO INTEIRA é obrigatório, não estilo. `useApplyPermissaoPreset`
-- (src/hooks/use-permissao-presets.ts) percorre o catálogo MODULOS do NAVEGADOR e grava, para
-- cada módulo, o que achar no preset — e dentro de `funcionalidades`, o que não estiver na
-- lista fica de fora. Chave que existe no navegador e não sai daqui é apagada de quem a tinha,
-- no primeiro clique em qualquer preset. Foi assim que o preset "Total" chegou a tirar o Plano
-- de Vendas de quem o recebia, entre 24 e 31/08/2026 (migration 20260831200000) — lá era módulo
-- inteiro, aqui é uma funcionalidade dentro de `pedidos`, mas o mecanismo é o mesmo.
--
-- Por decisão do dono do produto (05/09/2026), a chave entra em 'total' e 'operacional' — ao
-- contrário de `ver_metas_vendedor`, que continua fora dos dois. O efeito aceito: um clique em
-- lote nesses dois presets passa a abrir a carteira da equipe para quem os receber.
--
-- A função abaixo é o corpo colhido do banco em produção em 05/09/2026 (via
-- pg_get_functiondef), não o do arquivo mais recente do repositório — este projeto já teve o
-- banco divergir do repositório antes (ver o comentário da migration 20260831200000). A ÚNICA
-- mudança é o acréscimo de "pauta_de_todos" ao fim do array de `pedidos`; as duas listas de
-- exceção (`NOT IN`) ficam como estavam.
--
-- Roda duas vezes sem estrago: o backfill (parte 2) só toca preset que ainda não conhece a
-- chave.
-- ============================================================================

BEGIN;

-- ─── 1. A fábrica de presets passa a conhecer `pauta_de_todos` ─────────────
CREATE OR REPLACE FUNCTION public.montar_permissoes_preset_padrao(p_preset_key text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT jsonb_object_agg(modulo, jsonb_build_object(
    'pode_ver', p_preset_key <> 'nenhum',
    'pode_criar', p_preset_key IN ('operacional', 'total'),
    'pode_editar', p_preset_key IN ('operacional', 'total'),
    'pode_excluir', p_preset_key = 'total',
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
    -- So o nivel 3 continua sendo funcionalidade. A quebra por fabricante virou parte do
    -- proprio acesso ao modulo.
    ('plano_vendas', '["ver_metas_vendedor"]'::jsonb),
    ('clientes',     '["importar","exportar","whatsapp"]'::jsonb),
    ('contatos',     '["whatsapp"]'::jsonb),
    -- 🔴 A LINHA QUE MUDOU: "pauta_de_todos" acrescentada ao fim. Não entra nas listas
    -- `NOT IN` acima — por isso ela sai `true` em 'total' e em 'operacional', e `false` em
    -- 'leitura' e 'nenhum' (o `funcionalidades` desses dois é sempre '{}'::jsonb).
    ('pedidos',      '["importar","exportar_pdf","alterar_status","whatsapp","mover_cards","filtrar_avancado","pauta_de_todos"]'::jsonb),
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

-- ─── 2. Backfill: os presets já gravados nas 8 empresas aprendem a chave ───
--
-- Reescrever a função (parte 1) NÃO alcança quem já foi materializado em
-- `permissao_presets.permissoes` — é jsonb gravado, não recalculado a cada leitura. Acréscimo
-- cirúrgico, no molde da 20260831200000: só grava onde a chave ainda não existe, então
-- preserva qualquer customização feita à mão num preset específico (ex.: o "Operacional" da MD
-- com `portal` desligado) e a migration pode rodar de novo sem estrago.
UPDATE public.permissao_presets p
   SET permissoes = jsonb_set(
         p.permissoes,
         '{pedidos,funcionalidades,pauta_de_todos}',
         to_jsonb(p.preset_key IN ('total', 'operacional')),
         true
       )
 WHERE p.origem = 'padrao'
   AND p.permissoes ? 'pedidos'
   AND NOT (p.permissoes -> 'pedidos' -> 'funcionalidades' ? 'pauta_de_todos');

COMMIT;

-- ============================================================================
-- CONFIRA DEPOIS DE APLICAR — os 4 presets de cada empresa, e o valor da chave em cada um:
--
--   select e.nome, p.preset_key,
--          p.permissoes -> 'pedidos' -> 'funcionalidades' -> 'pauta_de_todos' as chave
--     from public.permissao_presets p join public.empresas e on e.id = p.empresa_id
--    where p.origem = 'padrao' order by 1, 2;
--
-- Esperado: 'total' e 'operacional' = true; 'leitura' e 'nenhum' = false. Nenhum nulo.
-- Se algum vier nulo, o jsonb_set não achou o caminho — provavelmente aquele preset não tem o
-- bloco pedidos.funcionalidades. Pare e trate o caso antes de seguir.
-- ============================================================================
