import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Catálogo global: todos os produtos, com nome do fabricante. */

/** Lista de categorias distintas existentes (para sugestão). */

/** Importação em lote para uma fabricante. */

/** Remove uma categoria: seta categoria=NULL em todos os produtos que a usam. */

export function useUpdateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; nome?: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { error } = await supabase.from('fabricantes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
    },
  });
}

export function useDeleteFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('fabricantes')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // RLS bloqueia silenciosamente (0 linhas, sem erro) quando o usuário não tem permissão
      // de exclusão — sem essa checagem a UI reportaria sucesso com o registro intacto.
      if (!data || data.length === 0) {
        throw new Error(
          'Você não tem permissão para excluir este fabricante, ou o registro já não existe mais.',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
    },
  });
}
