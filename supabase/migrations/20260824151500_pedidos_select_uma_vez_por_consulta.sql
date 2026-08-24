-- ============================================================================
-- A regra de segurança de `pedidos` era cobrada uma vez por LINHA. Passa a ser
-- cobrada uma vez por CONSULTA.
-- ============================================================================
--
-- Este arquivo NÃO muda quem enxerga o quê. Muda quantas vezes o banco pergunta.
-- A prova de que o conjunto visível é idêntico está no fim do arquivo.
--
-- Pode rodar dentro de transação (o `supabase db push` embrulha o arquivo sozinho, e está
-- certo assim). Diferente da migration irmã 20260824151000, aqui não há CONCURRENTLY.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
-- ----------------------------------------------------------------------------
--
-- A política de leitura de `pedidos` era:
--
--   (usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id)
--
-- `usuario_in_my_empresa(usuario_id)` recebe a coluna da linha. Isso a torna uma expressão
-- que MUDA a cada linha — e o Postgres, obrigado a avaliá-la linha a linha, chama a função
-- 11.911 vezes para devolver 10 negócios. Cada chamada é um `EXISTS` sobre `usuarios`.
--
-- É o custo já registrado em CLAUDE.md §7.9 ("a política de RLS de `pedidos` chama
-- `usuario_in_my_empresa` uma vez por linha varrida"), agora atacado na origem.
--
-- MEDIDO EM 24/08/2026, vendedor Alex, consulta crua em `pedidos` (sem os vínculos, para
-- isolar o custo da política), primeira página de 10:
--
--   política atual ........... 36.882 buffers ..... 560 ms
--   política deste arquivo ...  1.189 buffers ......  8 ms   (sem o índice irmão)
--   com o índice irmão .......     59 buffers ......  1 ms
--
-- E na contagem exata que o Kanban pede (`count: 'exact'`), onde índice nenhum ajuda porque
-- não há `LIMIT` para encurtar a varredura, a política é o problema INTEIRO:
--
--   antes .... 35.829 buffers ..... 700 ms
--   depois ...    140 buffers ......   4 ms
--
-- ----------------------------------------------------------------------------
-- 🔴 POR QUE UMA FUNÇÃO NOVA, E NÃO UM SUBSELECT CRU NA POLÍTICA
-- ----------------------------------------------------------------------------
--
-- A forma tentadora é escrever direto na política:
--
--   usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = ...)
--
-- **Não faça.** Esse SELECT roda com os privilégios de QUEM CONSULTA, ou seja, sofre a
-- política de segurança de `usuarios`. A política de `pedidos` passaria a depender da de
-- `usuarios` sem nada no texto dizendo isso: mexer numa aperta ou afrouxa a outra, em
-- silêncio, meses depois, com quem mexeu sem a menor chance de perceber.
--
-- Este projeto já tem a cicatriz desse padrão — a política larga `Acesso pedidos empresa`
-- (removida em 20260824143000_pedidos_rls_fase_zero.sql) era exatamente um subselect cru
-- assim, e o comentário de reversão daquele arquivo o preserva por escrito.
--
-- A função abaixo é `SECURITY DEFINER`: roda com os privilégios do dono, enxerga `usuarios`
-- inteira, e por isso responde SEMPRE a mesma coisa, independente de política. E é `STABLE`,
-- que é o que autoriza o Postgres a avaliá-la **uma vez por consulta** em vez de por linha.
--
-- `SET search_path = public` não é enfeite em função `SECURITY DEFINER`: sem isso, quem
-- chama pode plantar um schema na frente e sequestrar o nome das tabelas.
--
-- CONFERIDO no plano de execução (EXPLAIN ANALYZE, 24/08/2026): o Postgres monta
-- `hashed SubPlan` com 13 linhas, executado **1 vez**, e o filtro por linha vira uma consulta
-- a essa tabelinha em memória.
--
-- ----------------------------------------------------------------------------
-- 🔴 POR QUE O SEGUNDO RAMO (`OR u.id = get_my_usuario_id()`)
-- ----------------------------------------------------------------------------
--
-- A política antiga tinha DOIS ramos, e o primeiro não é decoração. `usuario_in_my_empresa`
-- compara `empresa_id = (meu empresa_id)`; quando o meu `empresa_id` é NULO, essa comparação
-- não dá "falso", dá NULO — e o ramo inteiro morre. Quem está sem empresa hoje enxerga os
-- próprios negócios SÓ pelo primeiro ramo.
--
-- Uma função que devolvesse apenas "os ids da minha empresa" apagaria esse caso. Medido: o
-- usuário `Admin Master` (empresa_id nulo) enxerga hoje exatamente os negócios dele; com a
-- versão só-empresa passaria a enxergar ZERO — a tela dele abriria vazia, sem erro nenhum.
--
-- O `OR u.id = get_my_usuario_id()` reproduz o primeiro ramo termo a termo. Não é folga de
-- segurança: `get_my_usuario_id()` devolve o id da MINHA linha em `usuarios`, então o
-- conjunto cresce em no máximo mim mesmo — que a política antiga já deixava passar.
--
-- ----------------------------------------------------------------------------
-- COMO VOLTAR ATRÁS
-- ----------------------------------------------------------------------------
--
--   DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
--   CREATE POLICY "pedidos_select" ON public.pedidos
--   FOR SELECT TO authenticated
--   USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
--   DROP FUNCTION IF EXISTS public.usuarios_da_minha_empresa();
--
-- `usuario_in_my_empresa` NÃO é removida por este arquivo: outras 45 políticas do sistema
-- ainda a usam. Aqui ela só deixa de ser chamada por `pedidos_select`.
-- ============================================================================

-- ── 1. Quem eu posso enxergar, respondido uma vez ──────────────────────────

CREATE OR REPLACE FUNCTION public.usuarios_da_minha_empresa()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
    FROM public.usuarios u
   WHERE u.empresa_id = public.get_my_empresa_id()
      OR u.id = public.get_my_usuario_id();
$$;

COMMENT ON FUNCTION public.usuarios_da_minha_empresa() IS
  'Ids de usuário cujos negócios o usuário logado pode ler. Existe para a política de SELECT '
  'de `pedidos` ser avaliada uma vez por consulta (hashed SubPlan) em vez de uma vez por '
  'linha varrida — 36.882 buffers para 1.189 na base da MD, medido em 24/08/2026. '
  'O segundo ramo (id = get_my_usuario_id) preserva o caso do usuário sem empresa, que a '
  'política antiga cobria pelo primeiro OR. Não filtra `deleted_at` DE PROPÓSITO: a política '
  'antiga também não filtrava, e filtrar aqui esconderia negócios de quem saiu da equipe.';

REVOKE EXECUTE ON FUNCTION public.usuarios_da_minha_empresa() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.usuarios_da_minha_empresa() TO authenticated;

-- ── 2. A política, com a mesma resposta e uma pergunta só ──────────────────
--
-- `IF EXISTS` porque este arquivo precisa poder rodar duas vezes sem quebrar: o ambiente não
-- tem banco local e a aplicação é feita à mão contra produção.

DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;

CREATE POLICY "pedidos_select" ON public.pedidos
FOR SELECT TO authenticated
USING ( usuario_id IN (SELECT public.usuarios_da_minha_empresa()) );

-- ============================================================================
-- A PROVA DE QUE A SEGURANÇA NÃO MUDOU  (ensaiada em 24/08/2026, em transação revertida)
-- ============================================================================
--
-- Não basta comparar CONTAGEM: duas listas de 11.911 podem ser listas diferentes. O ensaio
-- comparou o CONJUNTO, pelo md5 dos ids ordenados, para os 26 usuários do sistema, um a um,
-- antes e depois da troca. **Os 26 deram o mesmo conjunto.**
--
--   MD Representações   13 usuários (6 gestores, 1 líder comercial, 6 vendedores)
--                       11.911 antes → 11.911 depois, mesmo md5
--   House Design         2 usuários       1 antes →      1 depois, mesmo md5
--   Admin Master (sem empresa)             1 antes →      1 depois, mesmo md5
--   Climb, JHS, MD, Teste, TESTE, Teste Empresa
--                        10 usuários       0 antes →      0 depois
--
-- O ensaio não se contentou com os dados que já existem. Ele INSERIU, dentro da transação
-- revertida, dois negócios sintéticos com `created_at` no futuro — ou seja, no TOPO da
-- ordenação da tela, exatamente onde um vazamento apareceria na primeira página:
--
--   · um negócio de OUTRA empresa (responsável: Vitor Azevedo, House Design)
--   · um negócio de um usuário SEM empresa (Admin Master)
--
-- Resultado, antes e depois, idêntico:
--
--   · os 13 usuários da MD continuaram vendo 11.911 — nenhum dos dois entrou
--   · Vitor Azevedo (dono) e Anderson Santana (mesma empresa) viram o negócio da House Design
--   · Admin Master viu o dele, e só o dele
--
-- Ou seja: o negócio sintético era alcançável de verdade (não foi um teste que não testou
-- nada), e mesmo assim não atravessou a fronteira entre empresas em nenhuma das duas
-- políticas.
-- ============================================================================
