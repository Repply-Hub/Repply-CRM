-- Corrige conversas de WhatsApp duplicadas para o mesmo contato: o webhook gravava o
-- telefone cru do JID (que para celulares BR antigos vem sem o 9º dígito), enquanto a
-- criação manual de conversa gravava o número informado pelo usuário (com o 9º dígito),
-- então o mesmo contato acabava com duas linhas em whatsapp_conversas.
--
-- normalize_whatsapp_phone() replica a lógica do app (src/hooks/use-whatsapp-inbox.ts)
-- e dos edge functions whatsapp-webhook/whatsapp-send: sempre 55 + DDD + 9 + número.

CREATE OR REPLACE FUNCTION normalize_whatsapp_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
BEGIN
  -- só remove "55" se for código de país (DDD 55 do RS também começa com "55")
  IF length(digits) > 11 AND left(digits, 2) = '55' THEN
    digits := substr(digits, 3);
  END IF;

  IF length(digits) = 10 THEN
    digits := substr(digits, 1, 2) || '9' || substr(digits, 3);
  END IF;

  RETURN '55' || digits;
END;
$$;

DO $$
DECLARE
  dup RECORD;
  primary_id uuid;
  dup_id uuid;
BEGIN
  FOR dup IN
    SELECT empresa_id, normalize_whatsapp_phone(telefone) AS telefone_norm
    FROM whatsapp_conversas
    GROUP BY empresa_id, normalize_whatsapp_phone(telefone)
    HAVING count(*) > 1
  LOOP
    -- Escolhe como principal a conversa com nome de contato preenchido (geralmente a
    -- criada manualmente/vinculada a um cliente) e, em empate, a mais antiga.
    SELECT id INTO primary_id
    FROM whatsapp_conversas
    WHERE empresa_id = dup.empresa_id
      AND normalize_whatsapp_phone(telefone) = dup.telefone_norm
    ORDER BY (nome_contato IS NOT NULL) DESC, created_at ASC
    LIMIT 1;

    FOR dup_id IN
      SELECT id
      FROM whatsapp_conversas
      WHERE empresa_id = dup.empresa_id
        AND normalize_whatsapp_phone(telefone) = dup.telefone_norm
        AND id <> primary_id
    LOOP
      UPDATE whatsapp_mensagens SET conversa_id = primary_id WHERE conversa_id = dup_id;

      IF to_regclass('public.whatsapp_conversa_responsaveis') IS NOT NULL THEN
        UPDATE whatsapp_conversa_responsaveis wcr
        SET conversa_id = primary_id
        WHERE wcr.conversa_id = dup_id
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_conversa_responsaveis existing
            WHERE existing.conversa_id = primary_id AND existing.usuario_id = wcr.usuario_id
          );
        DELETE FROM whatsapp_conversa_responsaveis WHERE conversa_id = dup_id;
      END IF;

      -- soma não lidas e mantém a última mensagem mais recente entre as duas
      UPDATE whatsapp_conversas p
      SET nao_lidas = p.nao_lidas + d.nao_lidas,
          ultima_mensagem = CASE WHEN d.ultima_mensagem_at > p.ultima_mensagem_at THEN d.ultima_mensagem ELSE p.ultima_mensagem END,
          ultima_mensagem_at = GREATEST(p.ultima_mensagem_at, d.ultima_mensagem_at),
          nome_contato = COALESCE(p.nome_contato, d.nome_contato),
          foto_perfil_url = COALESCE(p.foto_perfil_url, d.foto_perfil_url),
          cliente_id = COALESCE(p.cliente_id, d.cliente_id),
          contato_id = COALESCE(p.contato_id, d.contato_id)
      FROM whatsapp_conversas d
      WHERE p.id = primary_id AND d.id = dup_id;

      DELETE FROM whatsapp_conversas WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Normaliza o telefone de todas as conversas restantes para o formato canônico,
-- para que o UNIQUE (empresa_id, telefone) volte a prevenir duplicidade de fato.
UPDATE whatsapp_conversas
SET telefone = normalize_whatsapp_phone(telefone)
WHERE telefone <> normalize_whatsapp_phone(telefone);
