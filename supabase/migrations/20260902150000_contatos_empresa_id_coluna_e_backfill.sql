-- ============================================================================
-- CONTATOS GANHA `empresa_id` PRÓPRIO (antes o vínculo com o assinante era só
-- indireto, via `usuario_id -> usuarios.empresa_id`)
-- ============================================================================
-- POR QUE ISTO PRECISA EXISTIR. `contatos` é uma das duas tabelas do banco
-- (a outra é `tarefas`) cujo recorte multi-empresa depende inteiramente de
-- `usuario_id`, e cuja política de leitura ainda tem a cláusula
-- `OR usuario_id IS NULL` SEM escopo de empresa (ver `docs/divida-tecnica.md`
-- item 58). Um contato gravado sem dono — o que o cadastro pela conversa de
-- WhatsApp fazia quando o perfil do React não tinha carregado
-- (`use-criar-contato-da-conversa.ts`, `usuario_id: profile?.id ?? null`) —
-- ficava visível para TODAS as empresas do sistema.
--
-- A coluna `empresa_id` é o alicerce do conserto: com ela, o contato órfão
-- passa a ser recortável por empresa, o INSERT pode ser validado contra o
-- login (próxima migration) e a leitura para de vazar (Commit 3).
--
-- Medido em 02/09/2026, antes deste backfill:
--   contatos ..................................... 1.154
--   resolvem empresa via usuario_id -> usuarios ... 1.154   (100%)
--   precisariam do fallback por cliente ..........     0
--   ficariam sem empresa_id ......................     0
--   usuario_id nulo ..............................     0
--   usuario_id apontando para usuário inexistente .     0
--
-- Esta migration NÃO torna a coluna obrigatória. `NOT NULL` só entra depois de
-- os pontos de INSERT do app passarem a preencher `empresa_id` no servidor
-- (Commit 2), para não recusar gravação legítima no intervalo entre um deploy
-- e outro.
-- ============================================================================

-- 1. A coluna. `IF NOT EXISTS` para a migration ser reidempotente.
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

CREATE INDEX IF NOT EXISTS idx_contatos_empresa_id ON public.contatos(empresa_id);

COMMENT ON COLUMN public.contatos.empresa_id IS
  'O assinante do SaaS dono deste contato. Preenchido no servidor por trigger '
  '(get_my_empresa_id()); o cliente nunca manda este valor. Antes de 02/09/2026 '
  'o vínculo com a empresa era só indireto via usuario_id -> usuarios.empresa_id.';

-- 2. Backfill principal: a empresa do usuário responsável pelo contato.
UPDATE public.contatos c
SET empresa_id = u.empresa_id
FROM public.usuarios u
WHERE c.usuario_id = u.id
  AND c.empresa_id IS NULL
  AND u.empresa_id IS NOT NULL;

-- 3. Fallback defensivo: contato sem dono resolvível, mas amarrado a um cliente
--    que tem empresa. Hoje `clientes.empresa_id` está nulo em toda a base, então
--    este passo não deve casar nada — está aqui só para o dia em que casar.
UPDATE public.contatos c
SET empresa_id = cl.empresa_id
FROM public.clientes cl
WHERE c.cliente_id = cl.id
  AND c.empresa_id IS NULL
  AND cl.empresa_id IS NOT NULL;

-- 4. Relatório: quantos contatos continuaram sem empresa_id depois do backfill.
--    Esperado 0 — mas a migration não assume; ela conta e avisa no log.
DO $$
DECLARE
  v_pendentes integer;
  v_total     integer;
BEGIN
  SELECT count(*) FILTER (WHERE empresa_id IS NULL), count(*)
    INTO v_pendentes, v_total
  FROM public.contatos;

  RAISE NOTICE 'contatos: % de % ainda sem empresa_id apos o backfill', v_pendentes, v_total;

  IF v_pendentes > 0 THEN
    RAISE WARNING 'Ha % contatos sem empresa_id. NAO aplique a migration de NOT NULL antes de resolve-los.', v_pendentes;
  END IF;
END $$;
