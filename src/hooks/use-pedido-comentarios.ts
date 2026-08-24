import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PedidoComentario {
  id: string;
  pedido_id: string;
  usuario_id: string;
  texto: string;
  created_at: string;
  updated_at: string | null;
  usuario: { id: string; nome: string } | null;
}

// Comentário manual do usuário sobre o negócio — diferente de pedidos.observacoes
// (descrição fixa) e de pedidos_historico_status (log automático de movimentação).
export function usePedidoComentarios(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido_comentarios', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos_comentarios')
        .select('*, usuario:usuarios(id, nome)')
        .eq('pedido_id', pedidoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoComentario[];
    },
  });
}

export function useAddPedidoComentario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, usuarioId, texto }: { pedidoId: string; usuarioId: string; texto: string }) => {
      const { error } = await supabase
        .from('pedidos_comentarios')
        .insert({ pedido_id: pedidoId, usuario_id: usuarioId, texto });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['pedido_comentarios', variables.pedidoId] });
    },
  });
}
