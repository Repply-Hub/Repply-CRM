-- Bug: as policies de configuracoes_tabelas comparavam usuarios.id (chave interna,
-- gerada por gen_random_uuid()) com auth.uid() (id do usuário no Supabase Auth).
-- Essas duas colunas nunca são iguais — o vínculo correto é usuarios.user_id = auth.uid(),
-- igual ao usado em todas as outras policies do sistema (is_gestor, get_my_usuario_id etc.).
-- Resultado prático: todo SELECT/INSERT/UPDATE em configuracoes_tabelas retornava vazio/
-- era bloqueado para qualquer usuário comum, então "Modelos" (presets de colunas) e demais
-- preferências de tabela nunca persistiam no banco — só sobreviviam via localStorage do
-- navegador, dando a impressão de que "não estava salvando".

DROP POLICY IF EXISTS "Users can view settings for their company" ON public.configuracoes_tabelas;
DROP POLICY IF EXISTS "Users can insert settings for their company" ON public.configuracoes_tabelas;
DROP POLICY IF EXISTS "Users can update settings for their company" ON public.configuracoes_tabelas;

CREATE POLICY "Users can view settings for their company"
ON public.configuracoes_tabelas
FOR SELECT
USING (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert settings for their company"
ON public.configuracoes_tabelas
FOR INSERT
WITH CHECK (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update settings for their company"
ON public.configuracoes_tabelas
FOR UPDATE
USING (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()
    )
);
