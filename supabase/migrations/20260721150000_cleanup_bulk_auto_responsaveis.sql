-- Bug histórico (corrigido em 20260709190000; ver comentário em
-- supabase/functions/whatsapp-webhook/index.ts): antes do fix, toda mensagem recebida
-- auto-atribuía TODOS os usuários vinculados à instância WhatsApp
-- (wapi_instancia_usuarios) como responsáveis da conversa, em vez de nenhum. Isso deixou
-- whatsapp_conversa_responsaveis com uma linha por usuário da instância em praticamente
-- toda conversa que recebeu mensagem antes da correção.
--
-- O fix no webhook impede novas linhas erradas, mas não limpou as que já existiam.
-- Aqui: detecta conversas onde o conjunto de responsáveis é EXATAMENTE igual ao
-- conjunto de usuários vinculados à instância da conversa (e tem mais de 1 responsável)
-- — assinatura do bug, já que ninguém adiciona manualmente todos os colegas de uma vez
-- via "Adicionar responsável" ou "Direcionar" (ambos atribuem um usuário por vez, ver
-- WhatsAppInbox.tsx) — e zera os responsáveis dessas conversas, devolvendo-as ao estado
-- "sem responsável" (aparecem como pendência no Inbox para alguém assumir de novo).

WITH instancia_usuarios AS (
  SELECT wiu.instancia_id, u.id AS usuario_id
  FROM public.wapi_instancia_usuarios wiu
  JOIN public.usuarios u ON u.user_id = wiu.usuario_auth_id
),
conversa_resp AS (
  SELECT conversa_id, array_agg(usuario_id ORDER BY usuario_id) AS resp_ids, count(*) AS resp_count
  FROM public.whatsapp_conversa_responsaveis
  GROUP BY conversa_id
),
instancia_set AS (
  SELECT instancia_id, array_agg(usuario_id ORDER BY usuario_id) AS inst_ids, count(*) AS inst_count
  FROM instancia_usuarios
  GROUP BY instancia_id
),
afetadas AS (
  SELECT c.id AS conversa_id
  FROM public.whatsapp_conversas c
  JOIN conversa_resp cr ON cr.conversa_id = c.id
  JOIN instancia_set ins ON ins.instancia_id = c.instancia_id
  WHERE cr.resp_count > 1
    AND cr.resp_count = ins.inst_count
    AND cr.resp_ids = ins.inst_ids
)
DELETE FROM public.whatsapp_conversa_responsaveis
WHERE conversa_id IN (SELECT conversa_id FROM afetadas);
