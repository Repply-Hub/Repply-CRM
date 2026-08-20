-- Guarda a direção ('entrada'/'saida') da última mensagem de cada conversa.
-- Sem isso, o CRM não tinha como saber que uma conversa "sem responsável"
-- já tinha sido respondida por alguém direto pelo celular/WhatsApp Web (fora
-- do CRM, onde não dá pra saber QUEM respondeu — por isso não tem como
-- atribuir um responsável automaticamente, só reconhecer que já foi
-- respondida). Isso fazia essas conversas ficarem paradas na fila "Não
-- atribuídos" mesmo com alguém do time já cuidando delas por fora, soando
-- alarme falso pro gestor.
--
-- Backfill: preenche com a direção da última mensagem real de cada conversa
-- (ignorando notas internas, que não são mensagens de fato), pra conversas já
-- respondidas por fora não aparecerem incorretamente na fila logo após o
-- deploy.

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS ultima_mensagem_direcao text;

UPDATE public.whatsapp_conversas c
SET ultima_mensagem_direcao = m.direcao
FROM (
  SELECT DISTINCT ON (conversa_id) conversa_id, direcao
  FROM public.whatsapp_mensagens
  WHERE is_nota_interna IS NOT TRUE
  ORDER BY conversa_id, created_at DESC
) m
WHERE m.conversa_id = c.id
  AND c.ultima_mensagem_direcao IS NULL;
