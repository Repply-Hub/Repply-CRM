import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTabelaPrecos(fabricanteId: string | null) {
  return useQuery({
    queryKey: ['tabela_precos', fabricanteId],
    queryFn: async () => {
      if (!fabricanteId) return [];
      const { data, error } = await supabase
        .from('tabela_precos')
        .select('*')
        .eq('fabricante_id', fabricanteId)
        .order('descricao_material');
      if (error) throw error;
      return data;
    },
    enabled: !!fabricanteId,
  });
}

export function useCreatePreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { fabricante_id: string; descricao_material: string; referencia?: string; preco_unitario: number; unidade?: string; vigente?: boolean }) => {
      const { error } = await supabase.from('tabela_precos').insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tabela_precos'] }),
  });
}

export function useUpdatePreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; descricao_material?: string; referencia?: string; preco_unitario?: number; unidade?: string; vigente?: boolean }) => {
      const { error } = await supabase.from('tabela_precos').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tabela_precos'] }),
  });
}

export function useDeletePreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tabela_precos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tabela_precos'] }),
  });
}

export function useUpdateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; nome?: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { error } = await supabase.from('fabricantes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricantes'] }),
  });
}

export function useDeleteFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fabricantes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricantes'] }),
  });
}
