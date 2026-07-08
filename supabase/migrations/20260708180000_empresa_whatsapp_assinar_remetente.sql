-- Permite que cada empresa opte por não incluir "*Nome - Cargo*" na primeira
-- linha das mensagens de WhatsApp enviadas pelo CRM (ver supabase/functions/whatsapp-send).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS whatsapp_assinar_remetente BOOLEAN NOT NULL DEFAULT true;
