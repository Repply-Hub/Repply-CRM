-- Função para excluir obras em massa de forma eficiente
CREATE OR REPLACE FUNCTION public.delete_obras_bulk(obra_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com privilégios de criador para contornar lentidão de RLS em grandes conjuntos
SET search_path = public
AS $$
BEGIN
    -- Verifica se o usuário tem permissão para deletar (is_gestor ou is_admin)
    IF NOT (
        SELECT EXISTS (
            SELECT 1 FROM public.usuarios 
            WHERE user_id = auth.uid() 
            AND role IN ('gestor', 'admin', 'empresa')
        )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Você não tem permissão para excluir obras.';
    END IF;

    -- Deleta as obras
    DELETE FROM public.obras
    WHERE id = ANY(obra_ids);
END;
$$;

-- Concede permissão para usuários autenticados chamarem a função
GRANT EXECUTE ON FUNCTION public.delete_obras_bulk(UUID[]) TO authenticated;
