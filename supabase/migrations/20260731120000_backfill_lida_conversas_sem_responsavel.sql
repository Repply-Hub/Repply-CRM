-- Bug: conversas sem responsável ("Não atribuídos") nunca disparavam o reset
-- automático de leitura ao abrir — só o próprio responsável dispara o reset em
-- useWaMarcarLida (ver comentário no useEffect de WhatsAppInbox.tsx). Como
-- resultado, mensagens de entrada que já tinham sido respondidas pela equipe
-- (existe mensagem de saída posterior na mesma conversa) continuavam com
-- lida = false indefinidamente, inflando whatsapp_conversas.nao_lidas bem acima
-- da quantidade real de mensagens ainda sem resposta. A migration
-- 20260729120000 já tinha recalculado nao_lidas a partir de lida, mas não
-- corrigia o lida em si (que também nunca foi setado nesses casos) — esta
-- migration marca como lidas as mensagens de entrada que já têm uma resposta
-- da equipe depois delas, e então recalcula nao_lidas a partir do estado
-- corrigido.

update whatsapp_mensagens m
set lida = true
where m.direcao = 'entrada'
  and m.lida = false
  and exists (
    select 1
    from whatsapp_mensagens saida
    where saida.conversa_id = m.conversa_id
      and saida.direcao = 'saida'
      and saida.created_at > m.created_at
  );

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
