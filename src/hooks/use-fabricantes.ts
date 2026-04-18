import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PrecoPayload {
  fabricante_id?: string;
  descricao_material: string;
  referencia?: string | null;
  preco_unitario: number;
  unidade?: string | null;
  vigente?: boolean;
  categoria?: string | null;
  imagem_url?: string | null;
}

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

/** Catálogo global: todos os produtos, com nome do fabricante. */
export function useCatalogoGlobal() {
  return useQuery({
    queryKey: ['catalogo_global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tabela_precos')
        .select('*, fabricantes(id, nome)')
        .order('descricao_material');
      if (error) throw error;
      return data;
    },
  });
}

/** Lista de categorias distintas existentes (para sugestão). */
export function useCategorias() {
  return useQuery({
    queryKey: ['catalogo_categorias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tabela_precos')
        .select('categoria')
        .not('categoria', 'is', null);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.categoria && set.add(r.categoria));
      return Array.from(set).sort();
    },
  });
}

export function useCreatePreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PrecoPayload & { fabricante_id: string }) => {
      const { error } = await supabase.from('tabela_precos').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tabela_precos'] });
      qc.invalidateQueries({ queryKey: ['catalogo_global'] });
      qc.invalidateQueries({ queryKey: ['catalogo_categorias'] });
    },
  });
}

/** Importação em lote para uma fabricante. */
export function useBulkCreatePrecos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: (PrecoPayload & { fabricante_id: string })[]) => {
      if (rows.length === 0) return { inserted: 0 };
      const { error } = await supabase.from('tabela_precos').insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tabela_precos'] });
      qc.invalidateQueries({ queryKey: ['catalogo_global'] });
      qc.invalidateQueries({ queryKey: ['catalogo_categorias'] });
    },
  });
}

export function useUpdatePreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<PrecoPayload>) => {
      const { error } = await supabase.from('tabela_precos').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tabela_precos'] });
      qc.invalidateQueries({ queryKey: ['catalogo_global'] });
      qc.invalidateQueries({ queryKey: ['catalogo_categorias'] });
    },
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
