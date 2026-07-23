-- Lembrete personalizado para eventos: quantos minutos antes do início notificar os participantes.
ALTER TABLE public.eventos
  ADD COLUMN lembrete_minutos integer,
  ADD COLUMN lembrete_enviado boolean NOT NULL DEFAULT false;

-- Reenvia o lembrete se o horário de início ou a antecedência configurada mudarem depois de já
-- ter sido notificado.
CREATE OR REPLACE FUNCTION public.eventos_reset_lembrete_enviado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.inicio IS DISTINCT FROM OLD.inicio
     OR NEW.lembrete_minutos IS DISTINCT FROM OLD.lembrete_minutos THEN
    NEW.lembrete_enviado := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER eventos_reset_lembrete_enviado
  BEFORE UPDATE ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.eventos_reset_lembrete_enviado();
