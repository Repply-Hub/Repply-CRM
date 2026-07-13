-- Conversas criadas antes de 2026-07-09 (quando a coluna instancia_id passou a ser
-- preenchida pelo webhook/envio) ficaram com instancia_id nulo mesmo já tendo vindo
-- de uma instância real — toda mensagem sempre chega/sai por alguma instância, então
-- "sem instância" não é um estado válido, só um buraco de dados legado. Backfill em
-- 3 passos, do mais certo pro mais aproximado:

-- 1. Empresas com uma única instância provisionada: sem ambiguidade possível.
UPDATE whatsapp_conversas c
SET instancia_id = cw.id
FROM configuracoes_wapi cw
WHERE c.instancia_id IS NULL
  AND c.empresa_id = cw.empresa_id
  AND cw.provisionada
  AND (
    SELECT count(*) FROM configuracoes_wapi cw2
    WHERE cw2.empresa_id = c.empresa_id AND cw2.provisionada
  ) = 1;

-- 2. Empresas com múltiplas instâncias: usa a instância vinculada a algum dos
-- responsáveis da conversa, quando há exatamente uma opção sem ambiguidade.
UPDATE whatsapp_conversas c
SET instancia_id = sub.instancia_id
FROM (
  SELECT r.conversa_id, MIN(wiu.instancia_id::text)::uuid AS instancia_id
  FROM whatsapp_conversa_responsaveis r
  JOIN usuarios u ON u.id = r.usuario_id
  JOIN wapi_instancia_usuarios wiu ON wiu.usuario_auth_id = u.user_id
  GROUP BY r.conversa_id
  HAVING COUNT(DISTINCT wiu.instancia_id) = 1
) sub
WHERE c.id = sub.conversa_id
  AND c.instancia_id IS NULL;

-- 3. Resto (sem responsável vinculado a nenhuma instância): não dá pra saber a
-- origem retroativamente, então cai na instância mais antiga da empresa — só pra
-- não sobrar nenhuma conversa "sem instância" fantasma na UI.
UPDATE whatsapp_conversas c
SET instancia_id = sub.instancia_id
FROM (
  SELECT DISTINCT ON (empresa_id) empresa_id, id AS instancia_id
  FROM configuracoes_wapi
  WHERE provisionada
  ORDER BY empresa_id, created_at ASC
) sub
WHERE c.empresa_id = sub.empresa_id
  AND c.instancia_id IS NULL;
