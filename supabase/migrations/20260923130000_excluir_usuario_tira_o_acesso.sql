-- ============================================================================
-- EXCLUIR USUARIO PASSA A TIRAR O ACESSO (item 38) — PARTE 1 de 2
-- ============================================================================
-- Ate hoje, "remover" alguem so carimbava `deleted_at` na linha de `usuarios`. A TELA barrava
-- (ProtectedRoute), o BANCO continuava liberando: as funcoes que respondem "quem e voce" nao
-- olhavam a exclusao. Quem saiu, com a sessao salva ou entrando de novo com a mesma senha,
-- seguia lendo e gravando pelo endereco direto.
--
-- Medido em 23/09/2026: 1 pessoa removida em 11/09 ainda com login ativo, 1 sessao aberta e
-- 1 token de renovacao nao revogado — lendo 1.314 clientes e 12.148 negocios.
--
-- 🔴 O CONSERTO QUE ESTAVA ESCRITO NO ITEM 38 NAO CONSERTAVA. Ele mandava filtrar apenas
-- get_my_usuario_id, get_my_empresa_id e is_gestor. Ensaiado exatamente assim, a pessoa
-- removida continuou lendo os mesmos 1.314 clientes — porque `usuario_in_my_empresa` tem uma
-- consulta PROPRIA de identidade dentro dela, que nao passa por nenhuma das tres. 53 regras de
-- acesso dependem dessa funcao.
--
-- 🔴 E A ARMADILHA ANOTADA NO ITEM 38 ESTA CERTA PELA METADE — a metade errada. Dizia que
-- filtrar `usuario_in_my_empresa` apagaria da tela o historico de quem saiu. A funcao tem DOIS
-- lados:
--     `id = _usuario_id`                        <- DE QUEM E A LINHA. Filtrar aqui apagaria o
--                                                  historico. NAO e tocado.
--     `empresa_id = (select ... auth.uid())`    <- QUEM ESTA PERGUNTANDO. E aqui que entra o
--                                                  filtro, e aqui nao apaga historico nenhum.
-- Medido: depois do conserto, o gestor continua vendo o negocio e a linha de quem saiu.
--
-- O QUE FICA DE FORA, DE PROPOSITO:
--   * `has_permission` / `has_funcionalidade` — recebem o id de fora, nao respondem "quem sou
--     eu". Filtrar ali quebraria o gestor consultando o que OUTRA pessoa pode fazer.
--   * a regra `usuarios_select` — o ramo `user_id = auth.uid()` e o que deixa a pessoa removida
--     ler a PROPRIA linha, e e disso que depende a tela honesta de "Conta suspensa". Ensaiado:
--     filtrar ali faz o perfil voltar nulo, cair em src/App.tsx:186 e o app deslogar em
--     looping.
--   * `can_access_wa_conversa` — ja fica fechada pelo get_my_empresa_id() daqui. Reescrever a
--     mao uma funcao de 20 linhas, copiando lista de cargos, e onde se perde um ramo sem ver.
--
-- Assinaturas identicas -> `create or replace` preserva dono (postgres) e permissoes.
-- Rollback: reaplicar as versoes anteriores (estao no historico do git).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_usuario_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id FROM public.usuarios
   WHERE user_id = auth.uid() AND deleted_at IS NULL
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT empresa_id FROM public.usuarios
   WHERE user_id = auth.uid() AND deleted_at IS NULL
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
     WHERE user_id = auth.uid() AND deleted_at IS NULL
       AND role IN ('gestor', 'admin', 'empresa')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
     WHERE user_id = auth.uid() AND deleted_at IS NULL
       AND role = 'admin'
  );
$function$;

-- A PECA QUE FALTAVA. O `id = _usuario_id` continua sem filtro (e o historico de quem saiu);
-- quem ganha o filtro e o outro lado, via get_my_empresa_id() acima.
CREATE OR REPLACE FUNCTION public.usuario_in_my_empresa(_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
     WHERE id = _usuario_id
       AND empresa_id = public.get_my_empresa_id()
  );
$function$;

COMMIT;
