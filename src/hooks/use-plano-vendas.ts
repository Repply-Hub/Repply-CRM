import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlanoVendasProgresso {
  fabricante_id: string;
  fabricante_nome: string;
  meta_valor: number;
  vendido_valor: number;
}

// Progresso (meta x vendido) por fabricante, agregado no servidor pela RPC
// plano_vendas_progresso — mesmo motivo de dashboard_stats: evita puxar todo
// `pedidos` do período pro cliente só pra somar por fabricante.
export function usePlanoVendasProgresso(ano: number, mes: number, usuarioId?: string) {
  return useQuery({
    queryKey: ['plano_vendas_progresso', ano, mes, usuarioId ?? 'empresa'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plano_vendas_progresso', {
        p_ano: ano,
        p_mes: mes,
        p_usuario_id: usuarioId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as PlanoVendasProgresso[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

export interface MetaVenda {
  id: string;
  fabricante_id: string;
  meta_valor: number;
}

// Linhas cruas de metas_vendas de um vendedor num mês — usadas só pra
// pré-preencher o formulário de edição do gestor (a visão de progresso usa a RPC acima).
export function useMetasVendas(usuarioId: string | undefined, ano: number, mes: number) {
  return useQuery({
    queryKey: ['metas_vendas', usuarioId, ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metas_vendas')
        .select('id, fabricante_id, meta_valor')
        .eq('usuario_id', usuarioId as string)
        .eq('ano', ano)
        .eq('mes', mes);
      if (error) throw error;
      return (data ?? []) as MetaVenda[];
    },
    enabled: !!usuarioId,
  });
}

interface UpsertMetaVendaInput {
  empresaId: string;
  usuarioId: string;
  fabricanteId: string;
  ano: number;
  mes: number;
  metaValor: number;
}

export function useUpsertMetaVenda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMetaVendaInput) => {
      const { error } = await supabase.from('metas_vendas').upsert(
        {
          empresa_id: input.empresaId,
          usuario_id: input.usuarioId,
          fabricante_id: input.fabricanteId,
          ano: input.ano,
          mes: input.mes,
          meta_valor: input.metaValor,
        },
        { onConflict: 'usuario_id,fabricante_id,ano,mes' },
      );
      if (error) throw error;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['metas_vendas', variables.usuarioId, variables.ano, variables.mes] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso'] });
    },
  });
}

export function useDeleteMetaVenda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('metas_vendas').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['metas_vendas'] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso'] });
    },
  });
}
