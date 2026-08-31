-- ============================================================================
-- A QUEBRA POR FABRICANTE SAI DA LISTA DE FUNCIONALIDADES
-- ============================================================================
--
-- Companheira da mudança de tela do mesmo dia. Decisão do Lucas em 31/08/2026, nas palavras
-- dele: "quando alguém recebe acesso ao plano de vendas isso significa ter acesso também a ver
-- as vendas detalhadas".
--
-- ─── O QUE MUDOU DO OUTRO LADO ──────────────────────────────────────────────
--
-- `PlanoVendasSection.tsx` deixou de exigir a funcionalidade `ver_metas_fabrica` para desenhar a
-- quebra por marca: agora basta ter o módulo (`pode_ver`). Com isso a chave não é lida por
-- ninguém — `use-permissoes.ts` também parou de listá-la, para o gestor não ver na tela de
-- permissões um interruptor que não faz nada.
--
-- Esta migration é o terceiro lado do mesmo triângulo. Sem ela, a função de presets continuaria
-- emitindo uma chave morta, e a próxima pessoa que grepasse `ver_metas_fabrica` a encontraria
-- aqui e concluiria que ainda está em uso.
--
-- ─── POR QUE A CHAVE NÃO ERA ACHADA ─────────────────────────────────────────
--
-- Ela morava dentro de um sanfonado, num bloco "Funcionalidades Específicas", com o rótulo
-- "Metas por Fabricante" — que não se parece com o que a pessoa procura quando quer "mostrar as
-- vendas detalhadas". Medido em `audit_permissoes`, em toda a história do produto:
--
--   40  aplicações de preset
--   28  cliques em pode_ver / pode_criar / pode_editar
--    1  clique em funcionalidade  (Portal, 27/07/2026)
--
-- Um, em treze meses. Não era descuido de quem configura: era uma porta que ninguém achava.
--
-- ─── O NÍVEL 3 CONTINUA SEPARADO, E CONTINUA FORA DOS PRESETS ───────────────
--
-- `ver_metas_vendedor` — o ranking nominal, quanto cada colega vendeu com nome — segue sendo
-- funcionalidade à parte e segue excluída de TODOS os presets, inclusive do "Total". Decisão do
-- Lucas no mesmo dia, com o motivo registrado na migration 20260831200000: abrir o desempenho
-- da equipe aos colegas não pode acontecer como efeito colateral de um clique em lote.
--
-- 🔴 Não junte as duas coisas achando que é simetria. Uma é o desempenho da EMPRESA por marca;
-- a outra é o desempenho de cada PESSOA, com nome.
-- ============================================================================


-- ─── 1. A fábrica de presets ────────────────────────────────────────────────
--
-- Corpo inteiro de novo (o Postgres não troca linha solta), com base na definição aplicada
-- horas antes por 20260831200000. A única diferença é a lista de `plano_vendas`.
--
-- O `NOT IN ('ver_metas_vendedor')` do ramo 'total' fica: agora ele é a única coisa que impede
-- o preset "Total" de conceder o ranking nominal.
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
    -- Só o nível 3 continua sendo funcionalidade. A quebra por fabricante virou parte do
    -- próprio acesso ao módulo.
    ('plano_vendas', '["ver_metas_vendedor"]'::jsonb),
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


-- ─── 2. Os presets já guardados perdem a chave morta ────────────────────────
--
-- Sem isto, empresa nova nasceria com um formato de preset e as dez de hoje ficariam com outro —
-- a divergência silenciosa que já custou dois bugs esta semana.
--
-- Só `origem = 'padrao'`: preset CUSTOMIZADO é uma fotografia que o gestor tirou das permissões
-- de alguém e batizou. Não é meu para reescrever, e a chave sobrando lá não faz mal a ninguém.
--
-- A guarda no WHERE torna a migration idempotente.
update public.permissao_presets
   set permissoes = jsonb_set(
         permissoes,
         '{plano_vendas,funcionalidades}',
         (permissoes #> '{plano_vendas,funcionalidades}') - 'ver_metas_fabrica'
       )
 where origem = 'padrao'
   and (permissoes #> '{plano_vendas,funcionalidades}') ? 'ver_metas_fabrica';

-- ⚠️ `permissoes_usuario` NÃO é limpa de propósito. Algumas pessoas têm `ver_metas_fabrica`
-- gravado lá desde o seed de 24/08/2026. A chave é ignorada por todo mundo agora, e varrer
-- dezenas de linhas de permissão de gente real para tirar um campo inerte é risco sem retorno.


comment on function public.montar_permissoes_preset_padrao(text) is
  'Monta o conteudo dos presets padrao de permissao. A lista de modulos aqui precisa bater com o '
  'catalogo MODULOS de src/hooks/use-permissoes.ts: aplicar um preset REESCREVE todas as '
  'permissoes da pessoa, e modulo que falta nesta lista e gravado como "nao pode ver". Foi assim '
  'que o preset "Total" passou a TIRAR o Plano de Vendas de quem o recebia, entre 24 e '
  '31/08/2026. Ao criar modulo novo no frontend, acrescente-o aqui na mesma migration. '
  'ver_metas_vendedor (ranking nominal da equipe) e excecao deliberada em TODOS os presets.';
