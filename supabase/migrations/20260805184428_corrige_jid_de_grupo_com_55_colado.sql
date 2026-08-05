-- Duas conversas de grupo ficaram com o JID corrompido: um "55" colado na frente.
--
--   55120363425871878269  ->  120363425871878269   (MD Representações, 7 mensagens)
--   55120363170942886188  ->  120363170942886188   (TESTE, 4 mensagens)
--
-- Origem: `normalizeWhatsappPhone` foi aplicada a um JID de grupo antes de a
-- guarda `digits.length > 14` entrar (commit 6f26b0c1, 27/07). A função prefixa
-- "55" por ser desenhada para telefone brasileiro, e o resultado é um JID que não
-- existe — todo envio para essas duas conversas estava condenado a falhar, mesmo
-- depois da correção do hífen desta entrega.
--
-- A segunda ainda estava com `is_group = false`, o que fazia a tela tratá-la como
-- conversa individual. Corrigido junto.
--
-- Verificado antes de aplicar: nenhuma das duas colide com uma conversa já
-- existente com o JID certo na mesma empresa (o UNIQUE é `(empresa_id, telefone)`).

UPDATE public.whatsapp_conversas
   SET telefone = regexp_replace(telefone, '^55(120363)', '\1'),
       is_group = true
 WHERE telefone ~ '^55120363';
