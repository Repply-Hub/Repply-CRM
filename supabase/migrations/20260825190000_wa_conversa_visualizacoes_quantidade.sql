-- Conta quantas vezes o mesmo usuário visualizou uma conversa sem assumir, ao
-- longo de ciclos sucessivos de "fica sem responsável" (fecha, reabre com
-- precisa_atribuicao=true, alguém olha e não assume de novo). Até aqui
-- whatsapp_conversa_visualizacoes só guardava a ÚLTIMA visualização (upsert
-- em visualizado_em) — não dava pra distinguir "olhei uma vez" de "olhei essa
-- conversa em três abandonos diferentes".
--
-- ADD COLUMN IF NOT EXISTS já é idempotente por si só (Postgres 9.6+); não
-- precisa de bloco DO/information_schema.
ALTER TABLE public.whatsapp_conversa_visualizacoes
  ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1;

-- Upsert atômico usado por useWaRegistrarVisualizacao (src/hooks/use-whatsapp-inbox.ts).
-- A REST API do PostgREST não expressa "quantidade = quantidade + 1" num upsert
-- comum (só aceita valores literais no payload) — sem RPC, duas abas do mesmo
-- usuário lendo o valor antigo e escrevendo por cima uma da outra perderiam
-- incremento. A função concentra leitura+escrita num único INSERT ... ON
-- CONFLICT, que o Postgres serializa sozinho pela unique key (conversa_id,
-- usuario_id) — sem necessidade de lock explícito.
--
-- Só incrementa quando as DUAS condições valem:
--   1. a conversa está com precisa_atribuicao=true agora (reabriu sem
--      responsável de verdade — ver whatsapp_precisa_atribuicao.sql);
--   2. a conversa mudou (updated_at) DEPOIS da última visualização registrada
--      deste usuário.
-- (2) é o que evita inflar o contador ao só reabrir a mesma aba, trocar de
-- conversa e voltar, ou o efeito rodar de novo sem nada ter mudado: nesses
-- casos updated_at não avançou desde o visualizado_em salvo, e a condição cai
-- pro ramo "else 0". Isso funciona porque updated_at de whatsapp_conversas é
-- tocado por QUALQUER update na linha (trigger genérico de moddatetime), não
-- só por reabertura — então uma nova mensagem chegando enquanto a conversa já
-- está aberta e sem responsável também conta como "mudou depois que eu vi", o
-- que é o comportamento certo: é uma nova chance de assumir que a pessoa
-- deixou passar.
--
-- SECURITY INVOKER (padrão, omitido) — corre como quem chama, então a RLS de
-- whatsapp_conversa_visualizacoes (insert/update exigindo usuario_id =
-- get_my_usuario_id()) continua sendo a autorização real, sem bypass.
CREATE OR REPLACE FUNCTION public.wa_registrar_visualizacao(_conversa_id uuid)
 RETURNS TABLE (quantidade integer, visualizado_em timestamptz)
 LANGUAGE sql
 SET search_path TO 'public'
AS $$
  WITH conv AS (
    SELECT c.precisa_atribuicao, c.updated_at
    FROM public.whatsapp_conversas c
    WHERE c.id = _conversa_id
  )
  INSERT INTO public.whatsapp_conversa_visualizacoes AS v (conversa_id, usuario_id, visualizado_em, quantidade)
  VALUES (_conversa_id, public.get_my_usuario_id(), now(), 1)
  ON CONFLICT (conversa_id, usuario_id) DO UPDATE SET
    quantidade = v.quantidade
      + CASE
          WHEN (SELECT precisa_atribuicao FROM conv)
               AND (SELECT updated_at FROM conv) > v.visualizado_em
          THEN 1
          ELSE 0
        END,
    visualizado_em = now()
  RETURNING v.quantidade, v.visualizado_em;
$$;

GRANT EXECUTE ON FUNCTION public.wa_registrar_visualizacao(uuid) TO authenticated;
