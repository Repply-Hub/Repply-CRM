-- Corrige conversas de WhatsApp cujo telefone ganhou um 9º dígito espúrio.
--
-- A normalização antiga enfiava o 9 em qualquer número de 10 dígitos — inclusive
-- FIXO, cujo JID real não tem o 9 (fixo com WhatsApp é comum em empresa; o caso
-- que denunciou o bug foi "CST Construção, (84) 2030-0387"). A conversa nascia
-- com um número inexistente: recebia normalmente (o webhook re-normalizava cada
-- inbound do mesmo jeito) e falhava TODO envio, busca de foto e renomeio.
--
-- POR QUE POR EVIDÊNCIA, E NÃO POR FAIXA. A primeira versão deste conserto
-- classificava por numeração ANATEL ("9+[2-5] não existe como celular") e teria
-- corrompido metade dos casos: das 22 conversas nesse padrão, 11 são números
-- GENUÍNOS que usam o 9 — uma delas com 35 mensagens lidas. A faixa não
-- distingue. O que distingue é o JID que o próprio provedor usa, visível nos
-- eventos crus do webhook. Este script só toca conversas em que:
--
--   (a) há pelo menos 1 evento cru citando a variante SEM o 9;
--   (b) há ZERO eventos crus citando a variante COM o 9;
--   (c) nenhum envio jamais chegou a 'entregue' ou 'lido'.
--
-- Excluem-se da evidência os registros _debug/_envio_recusado/_reaction_debug,
-- que carregam o número ERRADO que nós mesmos tentamos enviar.
--
-- Na medição de 07/08 isso seleciona exatamente 11 conversas (evidência sem-9
-- de 815, 589, 302, 286, 163, 113, 101, 67, 7, 7 e 5 eventos; zero em
-- contrário; 91 envios tentados, zero entregues). É deliberadamente
-- re-executável: rodar de novo no dia seguinte varre o que o deploy gradual
-- (frontend em cache, janela entre migração e functions novas) tiver recriado.
-- O fallback do whatsapp-send cobre o que não tiver evidência aqui: tenta a
-- variante quando o WhatsApp recusa o número e corrige a conversa sozinho.

DO $$
DECLARE
  alvo record;
  v_sem_nove text;
  v_duplicata uuid;
BEGIN
  FOR alvo IN
    SELECT c.id, c.empresa_id, c.telefone
    FROM whatsapp_conversas c
    WHERE c.is_group = false
      AND c.telefone ~ '^55\d{2}9[2-5]\d{7}$'
  LOOP
    v_sem_nove := substring(alvo.telefone from 1 for 4) || substring(alvo.telefone from 6);

    -- (a) evidência a favor: o provedor usa a forma sem 9
    IF NOT EXISTS (
      SELECT 1 FROM webhook_debug w
      WHERE coalesce(w.payload->>'_debug','') <> 'true'
        AND coalesce(w.payload->>'_envio_recusado','') <> 'true'
        AND coalesce(w.payload->>'_reaction_debug','') <> 'true'
        AND w.payload::text LIKE '%' || v_sem_nove || '%'
    ) THEN
      CONTINUE;
    END IF;

    -- (b) evidência em contrário: o provedor nunca usa a forma com 9
    IF EXISTS (
      SELECT 1 FROM webhook_debug w
      WHERE coalesce(w.payload->>'_debug','') <> 'true'
        AND coalesce(w.payload->>'_envio_recusado','') <> 'true'
        AND coalesce(w.payload->>'_reaction_debug','') <> 'true'
        AND w.payload::text LIKE '%' || alvo.telefone || '%'
    ) THEN
      RAISE NOTICE '[9-espurio] % tem eventos com 9 — NAO migrado', alvo.telefone;
      CONTINUE;
    END IF;

    -- (c) nenhum envio DO CRM jamais foi entregue. O filtro de usuario_id e
    -- essencial: mensagens enviadas do CELULAR tambem sao 'saida' (refletidas
    -- pelo webhook, usuario_id nulo) e recebem recibos — mas saem pelo JID real
    -- do aparelho, entao nao provam nada sobre o numero GRAVADO na conversa.
    -- Sem o filtro, 6 das 11 conversas quebradas ficariam sem conserto.
    IF EXISTS (
      SELECT 1 FROM whatsapp_mensagens m
      WHERE m.conversa_id = alvo.id
        AND m.direcao = 'saida'
        AND m.usuario_id IS NOT NULL
        AND m.status IN ('entregue', 'lido')
    ) THEN
      RAISE NOTICE '[9-espurio] % tem entregas — NAO migrado', alvo.telefone;
      CONTINUE;
    END IF;

    -- Ja existe conversa com a forma correta? (hoje: zero casos; e a rede de
    -- seguranca para re-execucoes durante a janela de deploy)
    SELECT id INTO v_duplicata
    FROM whatsapp_conversas
    WHERE empresa_id = alvo.empresa_id AND telefone = v_sem_nove;

    IF v_duplicata IS NOT NULL THEN
      -- Merge: o historico inteiro vai para a sobrevivente (a de telefone certo).
      UPDATE whatsapp_mensagens SET conversa_id = v_duplicata WHERE conversa_id = alvo.id;

      INSERT INTO whatsapp_conversa_responsaveis (conversa_id, usuario_id)
      SELECT v_duplicata, r.usuario_id
      FROM whatsapp_conversa_responsaveis r
      WHERE r.conversa_id = alvo.id
      ON CONFLICT (conversa_id, usuario_id) DO NOTHING;
      DELETE FROM whatsapp_conversa_responsaveis WHERE conversa_id = alvo.id;

      UPDATE whatsapp_conversas d SET
        nao_lidas = d.nao_lidas + a.nao_lidas,
        ultima_mensagem = CASE WHEN a.ultima_mensagem_at > coalesce(d.ultima_mensagem_at, '-infinity')
                               THEN a.ultima_mensagem ELSE d.ultima_mensagem END,
        ultima_mensagem_at = greatest(coalesce(d.ultima_mensagem_at, a.ultima_mensagem_at), a.ultima_mensagem_at),
        nome_contato = coalesce(d.nome_contato, a.nome_contato),
        cliente_id = coalesce(d.cliente_id, a.cliente_id),
        contato_id = coalesce(d.contato_id, a.contato_id)
      FROM whatsapp_conversas a
      WHERE d.id = v_duplicata AND a.id = alvo.id;

      DELETE FROM whatsapp_conversas WHERE id = alvo.id;
      RAISE NOTICE '[9-espurio] % mesclada na conversa % (%)', alvo.telefone, v_duplicata, v_sem_nove;
    ELSE
      UPDATE whatsapp_conversas SET telefone = v_sem_nove WHERE id = alvo.id;
      RAISE NOTICE '[9-espurio] % corrigida para %', alvo.telefone, v_sem_nove;
    END IF;
  END LOOP;
END $$;
