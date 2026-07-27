-- O webhook decidia se uma mensagem era de grupo só por msg.isGroup/payload.chat?.wa_isGroup,
-- sem checar o chatid (JID) terminando em "@g.us". Quando esses flags vinham ausentes/false
-- para um grupo, normalize_whatsapp_phone() era aplicada ao JID numérico do grupo (17-19
-- dígitos) como se fosse número BR, prefixando "55" e gerando um telefone corrompido
-- (ex: "120363042941422000" virava "55120363042941422000"). Isso quebrava o UNIQUE
-- (empresa_id, telefone) da conversa real do grupo e criava uma conversa "fantasma"
-- separada, com is_group=false, absorvendo silenciosamente as mensagens seguintes do grupo.
--
-- Números BR normais têm 13 dígitos (55 + DDD + 9 + número). Um telefone corrompido de
-- grupo, por já ter passado por normalize_whatsapp_phone, tem 55 + JID (17-19 dígitos) =
-- 19-21 dígitos — por isso o corte em > 17 não confunde com número BR real.
DO $$
DECLARE
  ghost RECORD;
  telefone_correto text;
  primary_id uuid;
BEGIN
  FOR ghost IN
    SELECT id, empresa_id, telefone
    FROM whatsapp_conversas
    WHERE is_group = false
      AND telefone ~ '^55'
      AND length(telefone) > 17
  LOOP
    telefone_correto := substr(ghost.telefone, 3);

    SELECT id INTO primary_id
    FROM whatsapp_conversas
    WHERE empresa_id = ghost.empresa_id
      AND telefone = telefone_correto
      AND id <> ghost.id;

    IF primary_id IS NOT NULL THEN
      -- já existe a conversa real do grupo: move as mensagens/responsáveis pra lá e
      -- soma não lidas, igual ao padrão usado em 20260707105533_merge_duplicate_whatsapp_conversas.sql
      UPDATE whatsapp_mensagens SET conversa_id = primary_id WHERE conversa_id = ghost.id;

      IF to_regclass('public.whatsapp_conversa_responsaveis') IS NOT NULL THEN
        UPDATE whatsapp_conversa_responsaveis wcr
        SET conversa_id = primary_id
        WHERE wcr.conversa_id = ghost.id
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_conversa_responsaveis existing
            WHERE existing.conversa_id = primary_id AND existing.usuario_id = wcr.usuario_id
          );
        DELETE FROM whatsapp_conversa_responsaveis WHERE conversa_id = ghost.id;
      END IF;

      UPDATE whatsapp_conversas p
      SET nao_lidas = p.nao_lidas + d.nao_lidas,
          ultima_mensagem = CASE WHEN d.ultima_mensagem_at > p.ultima_mensagem_at THEN d.ultima_mensagem ELSE p.ultima_mensagem END,
          ultima_mensagem_at = GREATEST(p.ultima_mensagem_at, d.ultima_mensagem_at),
          is_group = true
      FROM whatsapp_conversas d
      WHERE p.id = primary_id AND d.id = ghost.id;

      DELETE FROM whatsapp_conversas WHERE id = ghost.id;
    ELSE
      -- não existe conversa correta ainda: corrige a própria linha fantasma no lugar
      UPDATE whatsapp_conversas
      SET telefone = telefone_correto,
          is_group = true
      WHERE id = ghost.id;
    END IF;
  END LOOP;
END $$;
