-- Nova coluna para sustentar o filtro de período por "data de fechamento" (Negócios/
-- Dashboard), como alternativa a data_pedido (criação). Diferente de prazo_resposta
-- (editável livremente pelo usuário, usado hoje como data prevista/efetiva de
-- fechamento no formulário — ver NovoNegocioDialog.tsx), fechado_em é mantida só por
-- trigger: reflete o momento real em que o negócio entrou em 'fechamento'/'perdido', e
-- volta a NULL se o negócio for reaberto.
--
-- Ressalva: os filtros que usam esta coluna comparam fechado_em::date (dia corrido no
-- timezone de sessão do Postgres, tipicamente UTC), sem converter pro timezone do
-- Brasil — mesma limitação que já existe em outras comparações de data do projeto
-- (ex. o filtro "Atenção" em pedidos_stats, que compara created_at contra now() sem
-- ajuste de timezone).
ALTER TABLE public.pedidos ADD COLUMN fechado_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_pedidos_fechado_em ON public.pedidos (fechado_em);

-- Backfill: usa a primeira linha de pedidos_historico_status em que o negócio entrou
-- numa etapa final. Pedidos já fechados sem essa transição registrada (fechados antes
-- de pedidos_historico_status existir, 20260730180000) caem no updated_at como
-- aproximação — melhor do que ficar sem dado.
UPDATE public.pedidos p
SET fechado_em = COALESCE(
  (
    SELECT h.created_at FROM public.pedidos_historico_status h
    WHERE h.pedido_id = p.id AND h.status_novo IN ('fechamento', 'perdido')
    ORDER BY h.created_at ASC
    LIMIT 1
  ),
  p.updated_at
)
WHERE p.status IN ('fechamento', 'perdido');

-- BEFORE (não AFTER): precisa alterar NEW antes da gravação. Independente da trigger
-- trg_pedidos_historico_status (AFTER, mantém o log de auditoria) — as duas reagem à
-- mesma transição de status sem conflito, cada uma no seu propósito.
CREATE OR REPLACE FUNCTION public.fn_set_pedido_fechado_em()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('fechamento', 'perdido') THEN
      NEW.fechado_em := now();
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('fechamento', 'perdido') THEN
      NEW.fechado_em := now();
    ELSE
      -- Negócio reaberto (voltou de uma etapa final pra uma etapa aberta): o registro
      -- de "quando fechou" deixa de fazer sentido até fechar de novo.
      NEW.fechado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedidos_set_fechado_em
BEFORE INSERT OR UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.fn_set_pedido_fechado_em();
