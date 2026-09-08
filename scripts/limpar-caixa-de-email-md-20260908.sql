-- =============================================================================================
-- ZERAR A CAIXA DE E-MAIL DA MD REPRESENTAÇÕES *DENTRO DO REPPLY*
-- 08/09/2026 — pedido do Lucas, para a equipe validar a seção de E-mail com a caixa limpa.
--
-- 🔴 NÃO APAGA NADA DO GMAIL. As mensagens continuam intactas em atendimento@mdrepres.com.br.
--    O que muda é só o que o Repply mostra.
--
-- =============================================================================================
-- 🔴 POR QUE A PRIMEIRA TENTATIVA FALHOU — leia antes de mexer nesta parte do sistema
-- =============================================================================================
--
-- A primeira versão deste script fazia `DELETE FROM email_mensagens`. Funcionou por dois
-- minutos: às 17:28 os e-mails começaram a voltar sozinhos, e às 17:30 já eram 1.429, com
-- mensagens de 2023 entre elas.
--
-- Duas coisas, que juntas tornam o DELETE inútil aqui:
--
--   1. `src/pages/Emails.tsx:928` — a tela trata MARCADOR VAZIO como "ainda não busquei" e
--      dispara uma importação completa daquele marcador, sozinha, sem ninguém clicar:
--
--          if (totalReceived > 0) return;
--          void sincronizarAsync({ limit: 100, backfill: true, silencioso: true, pastas: [alvo] });
--
--      Depois do DELETE os 48 marcadores ficaram vazios, e cada um que a tela tocou se
--      reabasteceu. Apagar é o gatilho de reimportação, não o oposto dele.
--
--   2. `src/hooks/use-email-empresa.ts:128` — o botão de atualizar manda `backfill: true` por
--      padrão. Ou seja, nem o `ultima_sync_em` segura: qualquer atualização traz tudo.
--
-- 🔴 O CAMINHO CERTO JÁ EXISTIA NO SISTEMA, e é a coluna `excluido`. O comentário do próprio
--    `supabase/functions/email-sync/index.ts:279` explica:
--
--        // `excluido` fica FORA do payload (mensagemParaLinha não o inclui): o PostgREST só
--        // atualiza as colunas presentes, e incluí-la ressuscitaria o que o usuário apagou a
--        // cada sync.
--
--    A sincronização é PROIBIDA de mexer nessa coluna, de propósito. E a tela filtra
--    `.eq("excluido", false)` em todas as listagens. O próprio botão de excluir do aplicativo
--    não apaga linha nenhuma — ele marca `excluido = true` (`Emails.tsx:1067`).
--
--    Ou seja: esconder sobrevive à sincronização; apagar a provoca.
--
-- =============================================================================================
-- O QUE ESTE SCRIPT FAZ
-- =============================================================================================
--
--   PARTE 1  devolve as 2.047 mensagens que o DELETE tirou e que ainda não voltaram, JÁ
--            marcadas como excluídas. Elas precisam EXISTIR para a sincronização atualizar
--            a linha em vez de criar uma nova visível.
--   PARTE 2  marca como excluída toda mensagem anterior ao corte.
--   PARTE 3  (recomendada) um gatilho que segura qualquer mensagem antiga que apareça depois.
--
-- O CORTE: 08/09/2026 17:25 UTC (14:25 de Brasília), logo depois da limpeza e ANTES do e-mail
-- de teste das 17:29. Tudo anterior fica escondido; o teste do Lucas e a cotação da Interproj
-- que chegou às 17:30 continuam à vista, junto com tudo que chegar daqui para a frente.
--
-- =============================================================================================
-- COMO DESFAZER (traz tudo de volta à vista)
-- =============================================================================================
--
--   drop trigger if exists trg_email_esconde_antigo_md on public.email_mensagens;
--   drop function if exists public.email_esconde_antigo_da_md();
--
--   update public.email_mensagens set excluido = false
--    where empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128';
--
-- A cópia integral de antes de tudo continua em `backup_emails_md_20260908` (3.474 linhas).
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- PASSO 0 — TRAVA: confirma que o id é mesmo o da MD Representações.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.empresas
     where id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128' and nome = 'MD Representações'
  ) then
    raise exception 'PAREI: o id não é o da MD Representações. Nada foi alterado.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='backup_emails_md_20260908') then
    raise exception 'PAREI: a tabela de cópia backup_emails_md_20260908 não existe.';
  end if;
end $$;


-- ---------------------------------------------------------------------------------------------
-- PARTE 1 — devolve o que o DELETE tirou, já escondido.
--
-- Sem isto, cada uma dessas mensagens voltaria pela sincronização como linha NOVA, com
-- `excluido` no padrão (falso) — ou seja, visível. Trazê-las de volta escondidas é o que faz
-- a próxima sincronização apenas ATUALIZAR a linha, sem poder desfazer o esconder.
-- ---------------------------------------------------------------------------------------------
insert into public.email_mensagens (
  id, empresa_id, conta_id, nylas_message_id, nylas_thread_id, direcao,
  remetente_nome, remetente_email, destinatarios, cc, bcc, reply_to,
  assunto, snippet, corpo_html, tem_anexo, anexos, pastas,
  lido, favorito, excluido, envio_status, envio_erro, enviado_por,
  data_mensagem, criado_em, updated_at, caixa_origem
)
select
  b.id, b.empresa_id, b.conta_id, b.nylas_message_id, b.nylas_thread_id, b.direcao,
  b.remetente_nome, b.remetente_email, b.destinatarios, b.cc, b.bcc, b.reply_to,
  b.assunto, b.snippet, b.corpo_html, b.tem_anexo, b.anexos, b.pastas,
  b.lido, b.favorito, true, b.envio_status, b.envio_erro, b.enviado_por,
  b.data_mensagem, b.criado_em, b.updated_at, b.caixa_origem
from public.backup_emails_md_20260908 b
where not exists (
  select 1 from public.email_mensagens m
   where m.conta_id = b.conta_id and m.nylas_message_id = b.nylas_message_id
);


-- ---------------------------------------------------------------------------------------------
-- PARTE 2 — esconde tudo que é anterior ao corte.
-- ---------------------------------------------------------------------------------------------
update public.email_mensagens
   set excluido = true
 where empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
   and data_mensagem < timestamptz '2026-09-08 17:25:00+00'
   and excluido = false;


-- ---------------------------------------------------------------------------------------------
-- PARTE 3 — o gatilho que segura o que escapar. RECOMENDADO, e fácil de remover depois.
--
-- Fecha o único furo que sobra: uma mensagem antiga que exista no Gmail, seja anterior ao
-- corte e NUNCA tenha sido importada. Ela não está na cópia, então a Parte 1 não a alcança, e
-- entraria visível na primeira varredura que chegasse nela.
--
-- Vale SÓ para a MD e SÓ para o que é anterior ao corte. Mensagem nova passa reto.
-- ---------------------------------------------------------------------------------------------
create or replace function public.email_esconde_antigo_da_md()
returns trigger
language plpgsql
as $$
begin
  if new.empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'::uuid
     and new.data_mensagem < timestamptz '2026-09-08 17:25:00+00' then
    new.excluido := true;
  end if;
  return new;
end;
$$;

comment on function public.email_esconde_antigo_da_md() is
  'Temporário, 08/09/2026: mantém escondida do Repply a caixa da MD anterior a 08/09 17:25 UTC, '
  'para a equipe validar a seção de E-mail sem o histórico atrapalhando. Não apaga nada, no '
  'Repply nem no Gmail. Remover quando a validação terminar: '
  'drop trigger trg_email_esconde_antigo_md on public.email_mensagens; '
  'drop function public.email_esconde_antigo_da_md();';

drop trigger if exists trg_email_esconde_antigo_md on public.email_mensagens;
create trigger trg_email_esconde_antigo_md
before insert on public.email_mensagens
for each row execute function public.email_esconde_antigo_da_md();


-- ---------------------------------------------------------------------------------------------
-- PASSO FINAL — CONFERÊNCIA. Rode e leia antes de sair da tela.
-- ---------------------------------------------------------------------------------------------
select
  (select count(*) from public.email_mensagens
    where empresa_id='0c5df684-20d1-4d4f-b0f0-30676d4d4128' and excluido = false)  as visiveis_na_tela,
  (select count(*) from public.email_mensagens
    where empresa_id='0c5df684-20d1-4d4f-b0f0-30676d4d4128' and excluido)          as escondidas,
  (select count(*) from public.email_mensagens
    where empresa_id='0c5df684-20d1-4d4f-b0f0-30676d4d4128')                       as total_guardado,
  (select count(*) from public.email_mensagens
    where empresa_id <> '0c5df684-20d1-4d4f-b0f0-30676d4d4128')                    as outras_empresas_intactas,
  (select count(*) from pg_trigger
    where tgname='trg_email_esconde_antigo_md' and not tgisinternal)               as gatilho_ativo;

-- Esperado:
--   visiveis_na_tela ........... 2      (o "teste" das 17:29 e a cotação da Interproj das 17:30)
--   escondidas ................. 3474
--   total_guardado ............. 3476
--   outras_empresas_intactas ... 3328   (12 da Repply + 3.316 da TESTE)
--   gatilho_ativo .............. 1
