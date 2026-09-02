-- ============================================================================
-- `contatos.empresa_id` VIRA OBRIGATÓRIO
-- ============================================================================
-- Fecha o ciclo aberto em 20260902150000. Só é seguro rodar DEPOIS de:
--   - o backfill (20260902150000) ter resolvido todos os contatos existentes;
--   - o trigger (20260902151000) estar no ar preenchendo todo INSERT novo;
--   - os hooks de cadastro do app já resolverem o dono no servidor.
--
-- A migration se recusa a rodar se algum contato ainda estiver sem empresa_id —
-- é preferível a migration falhar em voz alta a coluna virar NOT NULL pela
-- metade.
-- ============================================================================

DO $$
DECLARE
  v_pendentes integer;
BEGIN
  SELECT count(*) INTO v_pendentes FROM public.contatos WHERE empresa_id IS NULL;

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION
      'Abortado: % contatos ainda sem empresa_id. Rode o backfill de 20260902150000 antes de aplicar NOT NULL.',
      v_pendentes;
  END IF;
END $$;

-- `SET NOT NULL` é reidempotente: reaplicar numa coluna que já é NOT NULL é
-- no-op. O guard abaixo evita só a varredura de validação desnecessária.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contatos'
      AND column_name = 'empresa_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.contatos ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;
