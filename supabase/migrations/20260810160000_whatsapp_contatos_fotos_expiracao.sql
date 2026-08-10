-- whatsapp_contatos_fotos (foto de participante de grupo, usada no painel de detalhes
-- da conversa) cacheava a URL da uazapi/Meta CDN para sempre, sem nunca revalidar. Essas
-- URLs trazem expiração embutida no parâmetro `oe` (mesmo mecanismo já tratado em
-- whatsapp_conversas.foto_perfil_expires_at) e em ~1-3 semanas o link assinado morre —
-- na prática, TODAS as 524 fotos cacheadas até aqui (a mais recente já tem 13 dias)
-- estavam vencidas, e a function passava a devolver eternamente o mesmo link quebrado.
--
-- Coluna nasce NULL para as linhas existentes de propósito: é o mesmo sinal de "precisa
-- revalidar" usado em whatsapp_conversas, então essas 524 fotos são automaticamente
-- reconsultadas na próxima vez que aparecerem no painel de participantes.

ALTER TABLE whatsapp_contatos_fotos
  ADD COLUMN IF NOT EXISTS foto_perfil_expires_at TIMESTAMPTZ;
