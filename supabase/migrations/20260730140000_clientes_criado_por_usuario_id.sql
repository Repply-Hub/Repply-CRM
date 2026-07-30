-- Coluna estruturada para "Criado por": até agora esse dado só existia como texto livre
-- em clientes.campos_extras->>'Criado por' (vindo de import, sem vínculo garantido a um
-- usuário real). Vira uma FK de verdade para permitir filtrar/agrupar com confiança.
--
-- Não reaproveita clientes.usuario_id porque esse campo já tem outro significado
-- (vendedor responsável atual, reatribuível) e, em importações, é preenchido com quem
-- RODOU a importação — não necessariamente quem criou o registro originalmente no
-- sistema de origem, que é o que "Criado por" representa.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS criado_por_usuario_id UUID REFERENCES public.usuarios(id);

CREATE INDEX IF NOT EXISTS idx_clientes_criado_por_usuario_id
  ON public.clientes(criado_por_usuario_id);
