-- `precisaAssumir` (WhatsAppInbox.tsx) sobrecarregava `ultima_mensagem_direcao` para
-- decidir se uma conversa sem responsável precisa de alarme: "!= 'saida'" tratava como
-- resolvidas tanto as conversas realmente respondidas pelo CRM quanto as reabertas por
-- uma mensagem de saída refletida do celular físico/WhatsApp Web (que nunca passou por
-- um responsável de verdade) — a mesma coisa que o commit adc9f356 tentou consertar por
-- outro ângulo. Esta coluna separa os dois significados: fica true só quando uma
-- conversa fechada é reaberta por algo que não passou pelo whatsapp-send (que já
-- garante um responsável via ensureResponsavel), e volta a false assim que alguém
-- assume. Ver bloco de update em supabase/functions/whatsapp-webhook/index.ts e
-- useWaSetResponsaveis em src/hooks/use-whatsapp-inbox.ts.

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN precisa_atribuicao boolean NOT NULL DEFAULT false;

-- Backfill: conversas que HOJE já estão abertas e sem responsável, mas nasceram do
-- bug (reabertas antes de esta coluna existir), ficariam escondidas de "Não
-- atribuídos" até a próxima mensagem reabrir de novo. Marca agora pra não deixar
-- esse estado já afetado invisível.
UPDATE public.whatsapp_conversas c
SET precisa_atribuicao = true
WHERE c.arquivada = false
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_conversa_responsaveis r
    WHERE r.conversa_id = c.id
  );
