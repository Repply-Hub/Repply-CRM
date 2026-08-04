-- Registro de erros de tela (ErrorBoundary do front).
--
-- POR QUE ISSO EXISTE: ate agora, quando o app caia em "Algo deu errado", o
-- erro so ia para o console do navegador -- e a mensagem era escondida da tela
-- em producao pela guarda `process.env.NODE_ENV !== "production"`. Na pratica
-- ninguem descobria o que quebrou, a menos que estivesse com o DevTools aberto
-- no exato momento (e o proprio "Recarregar" limpava o console). Esta tabela
-- existe para o usuario poder passar um codigo curto e o erro completo ser
-- recuperavel depois.
CREATE TABLE public.app_erros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- auth.users.id de quem viu o erro. Fica NULL quando o erro acontece numa
  -- tela publica (login, cadastro, landing) -- que e justamente onde hoje da
  -- pagina branca, entao precisa ser aceito.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  rota TEXT,
  mensagem TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  user_agent TEXT,
  -- Hash do build. Permite distinguir "erro da versao velha que o usuario ainda
  -- tinha em cache" de "erro da versao nova" -- distincao que importa aqui,
  -- porque chunk velho apos deploy e uma das causas que estamos corrigindo.
  versao TEXT
);

CREATE INDEX idx_app_erros_criado_em ON public.app_erros (criado_em DESC);
CREATE INDEX idx_app_erros_user ON public.app_erros (user_id, criado_em DESC);

ALTER TABLE public.app_erros ENABLE ROW LEVEL SECURITY;

-- INSERT: qualquer sessao autenticada grava, mas SO com o proprio user_id --
-- o WITH CHECK impede que alguem forje erro no nome de outro. Sem policy de
-- SELECT para authenticated: quem grava nao le de volta.
CREATE POLICY app_erros_insert_proprio
  ON public.app_erros FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Telas publicas (login/cadastro/landing) nao tem sessao. Sem isto, o caso que
-- hoje produz pagina branca continuaria sem registro nenhum. O WITH CHECK
-- exige user_id NULL, entao um anonimo nao consegue atribuir erro a ninguem.
CREATE POLICY app_erros_insert_anonimo
  ON public.app_erros FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Leitura so do administrador global. is_admin() e SECURITY DEFINER e ja e o
-- criterio usado nas RPCs do painel de CS.
CREATE POLICY app_erros_select_admin
  ON public.app_erros FOR SELECT TO authenticated
  USING (public.is_admin());

-- Sem UPDATE nem DELETE para ninguem: registro de erro e imutavel. A limpeza,
-- quando fizer falta, sai por job com service_role (que ignora RLS).
REVOKE UPDATE, DELETE ON public.app_erros FROM anon, authenticated;
