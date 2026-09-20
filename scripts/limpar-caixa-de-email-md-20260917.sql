-- =============================================================================================
-- ZERAR A CAIXA DE E-MAIL DA MD REPRESENTAÇÕES *DENTRO DO REPPLY* — "como se conectada hoje"
-- 17/09/2026 — pedido do Lucas, para a equipe validar a seção de E-mail com a caixa limpa,
-- desta vez incluindo o que subiu no mesmo dia: o ponto laranja de prioridade e os 3 consertos
-- de "lido" (commit 5e320992).
--
-- 🔴 NÃO APAGA NADA DO GMAIL. As mensagens continuam intactas em atendimento@mdrepres.com.br.
--    O que muda é só o que o Repply mostra.
--
-- Adaptado de scripts/limpar-caixa-de-email-md-20260908.sql, e MAIS SIMPLES que ele: como aqui
-- não deletamos nada (a Parte 1 e a tabela de cópia do original só existiam para consertar um
-- DELETE que voltou sozinho), bastam dois gestos, ambos reversíveis:
--   1. esconder (excluido=true) tudo — recebidos E enviados — anterior ao instante da execução;
--   2. mover o corte do gatilho temporário `email_esconde_antigo_da_md` de 08/09 para HOJE, para
--      segurar o histórico antigo que ressincronize.
--
-- POR QUE ESCONDER, E NÃO DELETAR: o comentário de email-sync/index.ts:279 explica que a
-- sincronização é PROIBIDA de mexer em `excluido` (senão ressuscitaria o que o usuário apagou), e
-- a tela filtra `.eq("excluido", false)`. Esconder sobrevive à sincronização; apagar a provoca
-- (marcador vazio dispara reimportação — foi o que fez o DELETE de 08/09 voltar em 2 minutos).
--
-- EXECUÇÃO REAL (conferida em produção logo depois):
--   corte = 2026-09-17 13:15:17.334188+00  ·  0 recebidos e 0 enviados visíveis  ·  4.173
--   escondidos  ·  624 ids guardados em backup_reset_caixa_md_20260917  ·  e-mail novo que chega
--   depois do corte aparece visível e já com o ponto laranja quando é de remetente conhecido.
--
-- COMO DESFAZER (traz de volta exatamente o que ESTE reset escondeu):
--   update public.email_mensagens set excluido = false
--    where id in (select id from public.backup_reset_caixa_md_20260917);
--   -- e depois devolver o corte do gatilho ao valor anterior (08/09 17:25) ou remover o gatilho:
--   -- drop trigger if exists trg_email_esconde_antigo_md on public.email_mensagens;
--   -- drop function if exists public.email_esconde_antigo_da_md();
-- =============================================================================================

do $do$
declare
  v_md    constant uuid := '0c5df684-20d1-4d4f-b0f0-30676d4d4128';
  v_corte timestamptz := now();   -- o instante da execução = "conectado agora"
  v_escondidos int;
begin
  -- Trava: confirma que o id é MESMO o da MD Representações.
  if not exists (select 1 from public.empresas where id = v_md and nome = 'MD Representações') then
    raise exception 'PAREI: o id não é o da MD Representações. Nada foi alterado.';
  end if;

  -- Cópia de segurança: os ids que ESTE reset vai esconder (só os visíveis agora).
  create table if not exists public.backup_reset_caixa_md_20260917 (
    id uuid primary key,
    escondido_em timestamptz not null default now()
  );
  insert into public.backup_reset_caixa_md_20260917 (id)
  select id from public.email_mensagens
   where empresa_id = v_md and excluido = false and data_mensagem < v_corte
  on conflict (id) do nothing;

  -- Esconde tudo (recebidos e enviados) anterior ao corte.
  update public.email_mensagens
     set excluido = true
   where empresa_id = v_md and excluido = false and data_mensagem < v_corte;
  get diagnostics v_escondidos = row_count;

  -- Recria o gatilho com o corte de HOJE congelado num literal. (Se o corte fosse now() dentro
  -- do gatilho, ele esconderia TODO e-mail novo — por isso tem de ser um instante fixo.)
  execute format($f$
    create or replace function public.email_esconde_antigo_da_md()
    returns trigger language plpgsql as $body$
    begin
      if new.empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'::uuid
         and new.data_mensagem < timestamptz %L then
        new.excluido := true;
      end if;
      return new;
    end;
    $body$;
  $f$, v_corte);

  drop trigger if exists trg_email_esconde_antigo_md on public.email_mensagens;
  create trigger trg_email_esconde_antigo_md
  before insert on public.email_mensagens
  for each row execute function public.email_esconde_antigo_da_md();

  raise notice 'OK. Corte = %. Escondidos neste reset: %.', v_corte, v_escondidos;
end
$do$;

-- Conferência (o editor mostra este resultado):
select
  count(*) filter (where excluido = false and direcao = 'recebido') as recebidos_visiveis,
  count(*) filter (where excluido = false and direcao = 'enviado')  as enviados_visiveis,
  count(*) filter (where excluido = true)                            as escondidos,
  (select count(*) from public.backup_reset_caixa_md_20260917)       as guardados_para_desfazer
from public.email_mensagens
where empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128';
