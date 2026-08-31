-- Editar mensagem do WhatsApp: registra que uma mensagem enviada foi editada.
--
-- O WhatsApp deixa editar só as mensagens de TEXTO que a própria conta enviou,
-- e só nos ~15 primeiros minutos. Quando isso acontece — pela função
-- `whatsapp-edit-message` (edição feita de dentro do CRM) ou pelo
-- `whatsapp-webhook` (o cliente editou pelo celular dele) —, o texto em
-- `conteudo` é SOBRESCRITO pelo texto novo, e estas colunas guardam o rastro:
--
--   editada           marca que houve pelo menos uma edição (a bolha mostra
--                     "· editada" ao lado da hora, igual ao app).
--   editada_at        quando foi a última edição.
--   conteudo_original o texto ANTES da primeira edição. Só é gravado uma vez
--                     (a função e o webhook só escrevem aqui quando ainda está
--                     NULL), então sobrevive a edições sucessivas.
--
-- Não mexe em RLS: coluna nova numa tabela que já tem política herda a política
-- de linha existente (`whatsapp_mensagens` já é filtrada por conversa/empresa).

alter table public.whatsapp_mensagens
  add column if not exists editada boolean not null default false,
  add column if not exists editada_at timestamptz,
  add column if not exists conteudo_original text;
