-- Permite fixar uma nota interna no topo do chat (ex: "cliente prefere ligação, não
-- WhatsApp"), mostrada numa faixa fixa acima do histórico em vez de só na posição
-- cronológica. Só faz sentido para linhas com is_nota_interna=true.
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS fixada boolean NOT NULL DEFAULT false;
