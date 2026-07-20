-- Ao fechar (arquivar) uma conversa de WhatsApp, todos os responsáveis atribuídos
-- devem ser removidos automaticamente — uma conversa fechada não deve continuar
-- "pertencendo" a ninguém; se for reaberta, alguém precisa assumi-la de novo (o
-- trigger trg_wa_conversa_auto_responsavel já cuida da auto-atribuição em novas
-- conversas, mas não existia nada equivalente para o fechamento).

CREATE OR REPLACE FUNCTION public.wa_conversa_remove_responsaveis_ao_fechar()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.arquivada = true AND OLD.arquivada IS DISTINCT FROM true THEN
    DELETE FROM public.whatsapp_conversa_responsaveis
    WHERE conversa_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conversa_remove_responsaveis_ao_fechar ON whatsapp_conversas;
CREATE TRIGGER trg_wa_conversa_remove_responsaveis_ao_fechar
  AFTER UPDATE OF arquivada ON whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.wa_conversa_remove_responsaveis_ao_fechar();
