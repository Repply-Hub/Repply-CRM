-- ============================================================================
-- A lista de seções deixa de estar cravada dentro de duas funções do banco
-- ============================================================================
--
-- DEFEITO RELATADO, e o que ele era de verdade
--
-- Ao acrescentar a seção "Hoje" em 24/08/2026, ela apareceu na tela de Presets mas NÃO na
-- aba de Empresas do painel de admin. A leitura natural — "as duas abas não estão
-- sincronizadas" — está certa no sintoma e errada na causa.
--
-- A causa: DUAS funções do banco carregavam a lista de seções CRAVADA no texto, com 12
-- nomes:
--
--   admin_secoes_por_empresa()   alimenta a aba Empresas do painel de admin
--   minhas_secoes()              alimenta o menu e a cascata de acesso do app inteiro
--
-- Uma seção nova entrava em `secao_preset_itens` (o dado), aparecia na tela de Presets (que
-- lê o dado), e sumia de tudo que passa por essas duas funções.
--
-- É a TERCEIRA lista canônica de seções — e o cabeçalho de `src/lib/secoes.ts` foi escrito
-- justamente para acabar com esse problema, quando havia duas. Ninguém sabia desta.
--
-- 🔴 O EFEITO COLATERAL, QUE ERA O MAIS GRAVE
--
-- `minhas_secoes()` nunca devolvia 'hoje'. E a tela só esconde o item de menu quando a
-- resposta é literalmente `false` (AppSidebar.tsx: `secoesDaEmpresa.get(id) === false`).
-- "Não sei" não esconde.
--
-- Resultado: o item "Hoje" apareceu no menu das 8 empresas, inclusive nas 7 em que a seção
-- está DESLIGADA no preset.
--
-- Não houve vazamento de dado: `pauta_do_dia_de` consulta `empresa_tem_secao_de`, que lê
-- `secao_preset_itens` direto e devolve `false` corretamente — quem clicasse via uma pauta
-- vazia, nunca a de outra empresa. Era vazamento de NAVEGAÇÃO.
--
-- O CONSERTO
--
-- As duas funções passam a derivar a lista DO DADO: toda seção que exista em qualquer
-- preset ou em qualquer exceção. Assim, acrescentar seção a um preset a faz aparecer nas
-- empresas sozinha, que é exatamente o comportamento esperado.
--
-- Seguro porque `admin_criar_preset` copia todos os itens do preset padrão: preset novo
-- nasce com a lista completa, e a união nunca encolhe.
-- ============================================================================

-- ── A fonte única, derivada do dado ────────────────────────────────────────

create or replace function public.secoes_conhecidas()
returns table (secao text)
language sql
stable
security definer
set search_path = public
as $$
  select i.secao from public.secao_preset_itens i
  union
  select x.secao from public.secao_excecoes x;
$$;

comment on function public.secoes_conhecidas() is
  'Toda seção que o banco conhece, derivada do dado (presets + exceções). Existe para que '
  'nenhuma função volte a carregar a lista cravada no texto — foi assim que a seção "hoje" '
  'apareceu na tela de Presets e sumiu da aba de Empresas em 24/08/2026.';

grant execute on function public.secoes_conhecidas() to authenticated;

-- ── 1. O menu e a cascata de acesso do app ─────────────────────────────────

create or replace function public.minhas_secoes()
returns table (secao text, habilitada boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.secao, public.empresa_tem_secao(s.secao)
    from public.secoes_conhecidas() s;
$$;

-- ── 2. A aba Empresas do painel de admin ───────────────────────────────────

create or replace function public.admin_secoes_por_empresa()
returns table (
  empresa_id   uuid,
  empresa_nome text,
  usuarios     bigint,
  preset_id    uuid,
  preset_nome  text,
  secao        text,
  habilitada   boolean,
  origem       text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode ver o controle de seções';
  end if;

  return query
  select e.id,
         e.nome,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         p.id,
         p.nome,
         s.secao,
         coalesce(x.habilitada, i.habilitada, true),
         case when x.habilitada is not null then 'excecao'
              when i.habilitada is not null then 'preset'
              else 'padrao' end
    from empresas e
    -- Era aqui que a lista de 12 nomes vivia. Agora vem do dado.
    cross join public.secoes_conhecidas() s
    left join secao_presets p
           on p.id = coalesce(e.secao_preset_id,
                              (select id from secao_presets where is_padrao))
    left join secao_preset_itens i on i.preset_id = p.id and i.secao = s.secao
    left join secao_excecoes     x on x.empresa_id = e.id and x.secao = s.secao
   order by e.nome, s.secao;
end;
$$;
