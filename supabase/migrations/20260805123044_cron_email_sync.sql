-- Agenda a varredura de e-mail a cada 15 minutos.
--
-- POR QUE ISTO PRECISA EXISTIR: o email-sync foi escrito desde o início para
-- ter um chamador automático — o próprio código distingue `ehCron` da chamada
-- do usuário e reserva o modo incremental para ele — mas o agendamento nunca
-- foi criado. Na prática a função só rodava quando alguém clicava em atualizar.
--
-- Duas coisas dependiam disso e ficavam quebradas sem um cron:
--
--  1. O ESPELHO DOS MARCADORES. A lista de pastas de `email_pastas` só é
--     atualizada aqui. Sem cron, um marcador criado no Gmail hoje nunca
--     apareceria na barra lateral, e um excluído ficaria para sempre como
--     filtro morto — e, pior, como unidade de compartilhamento fantasma na
--     tela de acesso.
--
--  2. A REDE DE PROTEÇÃO DO WEBHOOK. Um endpoint que devolve não-2xx em 95%
--     das entregas por 15 min vira `failing` no Nylas e, em 72 h, `failed` —
--     que NÃO reativa sozinho. Sem esta varredura, essa janela vira perda
--     silenciosa de e-mail, sem ninguém perceber.
--
-- 15 minutos e não 5: o webhook já entrega mensagem nova em tempo real, então
-- aqui a pressa não ajuda — e cada execução gasta uma chamada a /folders mais
-- uma por pasta varrida, por conta conectada.
--
-- Sem `backfill` no corpo: o modo incremental só pede o que chegou depois da
-- última varredura. Backfill é para quem clica em atualizar na tela.
--
-- NOTA: o comando é reescrito logo em seguida por
-- 20260805123341_corrige_precedencia_jsonb_nos_crons.sql, que conserta um bug
-- de precedência de operador herdado do cron de eventos-lembrete. Este arquivo
-- fica como está para preservar a história.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-sync') THEN
    PERFORM cron.unschedule('email-sync');
  END IF;
END $$;

SELECT cron.schedule('email-sync', '*/15 * * * *',
  $$ SELECT net.http_post(
    url:='https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/email-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body:='{"limit": 50}'::jsonb
  ) $$);
