-- As tabelas que NÃO entram no bloqueio por falta de pagamento.
--
-- 🔴 UMA LISTA SÓ, consultada pelo gerador (20260830100500) E pelo teste que quebra o build
-- (src/test/gate-de-plano.test.ts). Duas listas divergiriam em semanas — foi o que aconteceu
-- com a cópia manual do gate para `obra_contatos` em 27/08/2026, que saiu pela metade.
--
-- Cada nome aqui é uma decisão, não um esquecimento. Ver o plano em
-- docs/superpowers/plans/2026-08-29-cerco-do-bloqueio-de-plano.md
create or replace function public.tabelas_fora_do_gate()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- ── Sem isto o cliente não consegue nos PAGAR ────────────────────────────
    'usuarios',
    'empresas',
    'empresa_assinaturas',

    -- ── Leitura disfarçada de escrita: marcar como lido ──────────────────────
    'notificacoes_leituras',
    'chat_mensagens_leituras',
    'whatsapp_conversa_visualizacoes',

    -- ── Preferência de tela: travar irrita e não protege receita ─────────────
    'notificacoes',
    'sidebar_preferences',

    -- ── Log e auditoria: escritos pelo SISTEMA, não pela pessoa ──────────────
    -- 🔴 `app_erros` é onde o app relata erro. Travar perde a telemetria
    -- justamente de quem está bloqueado — cegaria a gente no pior momento.
    -- As de auditoria são escritas por gatilho; travar quebra o gatilho.
    'app_erros',
    'automation_logs',
    'audit_permissoes',
    'historico_alteracoes',
    'debug_logs',

    -- ── Catálogo compartilhado entre TODAS as empresas ───────────────────────
    -- `empresas` tem chave estrangeira APONTANDO PARA `secao_presets`: ele é
    -- referenciado pelas empresas, não pertence a nenhuma.
    'secao_presets',
    'secao_preset_itens',

    -- ── Raspagem de portal público, comum a todo mundo ───────────────────────
    'licencas_natal',
    'licencas_idema',
    'licencas_extremoz',

    -- ── Ligadas ao LOGIN, não à empresa ──────────────────────────────────────
    'gmail_tokens',
    'user_domains',
    'user_integrations',

    -- ── 🔴 Sem coluna de empresa NENHUMA ─────────────────────────────────────
    -- `perfis_customizados` tem 1 linha ("Líder comercial", criada pela gestora
    -- da MD em 02/07/2026) e RLS que deixa qualquer gestor de qualquer empresa
    -- escrever numa lista que todos enxergam. É vazamento de multi-tenancy que
    -- virou catálogo por acidente. Travar por plano não conserta nada; o
    -- conserto é outro e está fora desta etapa.
    'perfis_customizados'
  ]::text[];
$$;

comment on function public.tabelas_fora_do_gate() is
  'Tabelas que NÃO entram no bloqueio por falta de pagamento. Fonte única, lida pelo gerador e pelo teste.';

revoke all on function public.tabelas_fora_do_gate() from public, anon;
-- Só `service_role`. Não há chamador que precise de `authenticated`: quem consome é
-- `aplicar_gate_de_plano()` (que é SECURITY DEFINER e roda como service_role), e o teste do
-- build, que lê o TEXTO deste arquivo e nunca toca o banco. Conceder a mais é privilégio sem
-- chamador — mesmo padrão de `empresa_tem_secao_de` e `pauta_do_dia_de`.
grant execute on function public.tabelas_fora_do_gate() to service_role;
