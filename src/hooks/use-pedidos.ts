import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PedidoWithRelations {
  id: string;
  status: string;
  valor_total: number | null;
  data_pedido: string;
  created_at: string;
  observacoes: string | null;
  cliente_id: string;
  fabricante_id: string;
  usuario_id: string;
  obra_id: string | null;
  endereco_entrega: string | null;
  campos_extras: Record<string, any> | null;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  obra: { id: string; nome_obra: string } | null;
}

export function usePedidos(empresaId?: string) {
  return useQuery({
    queryKey: ['pedidos', empresaId],
    queryFn: async () => {
      const allData: PedidoWithRelations[] = [];
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('pedidos')
          .select(`
            id, status, valor_total, data_pedido, created_at, observacoes,
            cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras,
            cliente:clientes(id, empresa),
            fabricante:fabricantes(id, nome),
            vendedor:usuarios(id, nome, empresa_id),
            obra:obras(id, nome_obra)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (empresaId) {
          const { data: companyUsers } = await supabase
            .from('usuarios')
            .select('id')
            .eq('empresa_id', empresaId);
          
          if (companyUsers && companyUsers.length > 0) {
            query = query.in('usuario_id', companyUsers.map(u => u.id));
          } else {
            return [];
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData.push(...(data as unknown as PedidoWithRelations[]));
          from += pageSize;
          // Aumentado o limite para 50.000 para evitar que negócios "fiquem para trás" em grandes bases
          hasMore = data.length === pageSize && allData.length < 50000;
        } else {
          hasMore = false;
        }
      }

      return allData;
    },
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdatePedidoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'fechamento') {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localDate = new Date(now.getTime() - (offset * 60 * 1000));
        updateData.prazo_resposta = localDate.toISOString().split('T')[0];
      }
      const { error } = await supabase.from('pedidos').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['pedidos'] });
      const previous = qc.getQueryData<PedidoWithRelations[]>(['pedidos']);
      if (previous) {
        qc.setQueryData<PedidoWithRelations[]>(['pedidos'], old => 
          old?.map(p => p.id === id ? { ...p, status } : p)
        );
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['pedidos'], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
      qc.invalidateQueries({ queryKey: ['vw_velocidade_por_fabricante'] });
    },
  });
}

export function useHistoricoContatos(pedidoId: string | null) {
  return useQuery({
    queryKey: ['historico_contatos', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_contatos')
        .select('*, vendedor:vendedores(nome)')
        .eq('pedido_id', pedidoId!)
        .order('data_contato', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
