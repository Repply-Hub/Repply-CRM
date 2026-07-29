-- A edge function whatsapp-webhook incrementava whatsapp_conversas.nao_lidas a cada
-- entrega do webhook da uazapi, mas a linha da mensagem em si já era deduplicada por
-- wamid (upsert com ignoreDuplicates). Retries de webhook (timeout/cold start) faziam
-- o contador subir várias vezes para a mesma mensagem real, deixando o badge de "não
-- lidas" bem maior que a quantidade de mensagens de fato não lidas na conversa. O
-- código do webhook já foi corrigido para não incrementar em reentregas; esta migration
-- corrige os valores que já ficaram errados, recalculando a partir da contagem real de
-- mensagens recebidas (direcao='entrada') ainda com lida=false.
update whatsapp_conversas c
set nao_lidas = coalesce(sub.cnt, 0)
from (
  select conversa_id, count(*) as cnt
  from whatsapp_mensagens
  where direcao = 'entrada' and lida = false
  group by conversa_id
) sub
where c.id = sub.conversa_id
  and c.nao_lidas is distinct from sub.cnt;

update whatsapp_conversas c
set nao_lidas = 0
where nao_lidas > 0
  and not exists (
    select 1 from whatsapp_mensagens m
    where m.conversa_id = c.id and m.direcao = 'entrada' and m.lida = false
  );
