-- Conversas de grupo criadas antes da coluna is_group existir (ou cujo último
-- webhook recebido é anterior a essa lógica) ficaram com is_group = false, mesmo
-- sendo grupos de fato — o que fazia o header exibir o JID numérico bruto em vez
-- do nome dos participantes.
--
-- Números de telefone normais sempre têm o formato 55 + DDD (2) + 9 + número (8) =
-- 13 dígitos. JIDs de grupo do WhatsApp são bem mais longos (17-19 dígitos e não
-- seguem esse padrão), então usamos o comprimento para identificar e corrigir as
-- linhas que ficaram desatualizadas.
UPDATE whatsapp_conversas
SET is_group = true
WHERE is_group = false
  AND length(telefone) > 15;
