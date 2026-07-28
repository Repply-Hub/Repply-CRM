-- Grupos do WhatsApp tiveram o JID identificado de formas diferentes ao longo do
-- tempo (com "55" duplicado por normalize_whatsapp_phone antes da correção do
-- webhook, com/sem hífen no formato legado "<numero>-<timestamp>", com/sem o
-- sufixo retirado) — cada mudança de formato podia gerar uma conversa nova em vez
-- de reconhecer a já existente, deixando duplicatas: uma parada/arquivada com o
-- histórico antigo e outra recebendo as mensagens novas. A migration anterior
-- (20260727150000) só cobria o caso "is_group=false com telefone corrompido" e não
-- tratava esse cenário (ambas as linhas já tinham is_group=true).
--
-- Aqui a chave de identificação não é o telefone (que já provou ser instável),
-- e sim (empresa_id, nome_contato) para grupos — nome de grupo é bem mais estável
-- que o JID nesse histórico. Mantém como principal a conversa com a mensagem mais
-- recente (a que está de fato recebendo tráfego) e mescla o resto nela.
DO $$
DECLARE
  dup RECORD;
  primary_id uuid;
  dup_id uuid;
BEGIN
  FOR dup IN
    SELECT empresa_id, nome_contato
    FROM whatsapp_conversas
    WHERE is_group = true AND nome_contato IS NOT NULL
    GROUP BY empresa_id, nome_contato
    HAVING count(*) > 1
  LOOP
    SELECT id INTO primary_id
    FROM whatsapp_conversas
    WHERE empresa_id = dup.empresa_id
      AND nome_contato = dup.nome_contato
      AND is_group = true
    ORDER BY COALESCE(ultima_mensagem_at, created_at) DESC
    LIMIT 1;

    FOR dup_id IN
      SELECT id
      FROM whatsapp_conversas
      WHERE empresa_id = dup.empresa_id
        AND nome_contato = dup.nome_contato
        AND is_group = true
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

      UPDATE whatsapp_conversas p
      SET nao_lidas = p.nao_lidas + d.nao_lidas,
          ultima_mensagem = CASE WHEN d.ultima_mensagem_at > p.ultima_mensagem_at THEN d.ultima_mensagem ELSE p.ultima_mensagem END,
          ultima_mensagem_at = GREATEST(p.ultima_mensagem_at, d.ultima_mensagem_at),
          foto_perfil_url = COALESCE(p.foto_perfil_url, d.foto_perfil_url)
      FROM whatsapp_conversas d
      WHERE p.id = primary_id AND d.id = dup_id;

      DELETE FROM whatsapp_conversas WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;
