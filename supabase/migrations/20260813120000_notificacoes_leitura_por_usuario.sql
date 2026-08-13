-- Corrige leitura de notificações compartilhada indevidamente entre usuários.
--
-- Hoje `notificacoes` tem um único booleano `lida` por linha, e a política de RLS
-- permite que o dono (usuario_id) E qualquer gestor/admin/empresa da mesma empresa
-- façam SELECT/UPDATE na mesma linha (usuario_in_my_empresa). Como só existe um
-- `lida` compartilhado, quando qualquer um desses usuários marca como lida, a
-- notificação vira "lida" para todo mundo que a enxerga — não há "visto individual".
--
-- Esta migration introduz uma tabela de leitura por usuário (notificacoes_leituras)
-- e faz o backfill do estado `lida=true` já existente para o dono de cada
-- notificação, preservando o que já estava marcado como lido.

CREATE TABLE public.notificacoes_leituras (
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  lida_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notificacao_id, usuario_id)
);

CREATE INDEX notificacoes_leituras_usuario_id_idx
  ON public.notificacoes_leituras (usuario_id);

ALTER TABLE public.notificacoes_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY notificacoes_leituras_select ON public.notificacoes_leituras
  FOR SELECT TO authenticated
  USING (usuario_id = get_my_usuario_id());

CREATE POLICY notificacoes_leituras_insert ON public.notificacoes_leituras
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = get_my_usuario_id());

CREATE POLICY notificacoes_leituras_delete ON public.notificacoes_leituras
  FOR DELETE TO authenticated
  USING (usuario_id = get_my_usuario_id());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_leituras;

-- Backfill: preserva, para o dono de cada notificação, o estado já lido.
-- Gestores que não abriram individualmente cada notificação de outros usuários
-- voltam a vê-las como não lidas na própria conta — esse é o comportamento
-- correto pós-fix, não uma regressão.
INSERT INTO public.notificacoes_leituras (notificacao_id, usuario_id, lida_em)
SELECT id, usuario_id, now()
FROM public.notificacoes
WHERE lida = true
ON CONFLICT DO NOTHING;
