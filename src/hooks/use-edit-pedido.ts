import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePedidoCompleto(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido_completo', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data: pedido, error: pErr } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(id, empresa, tipo), fabricante:fabricantes(id, nome), vendedor:vendedores(id, nome), obra:obras(id, nome_obra, endereco_entrega, spe_cnpj)')
        .eq('id', pedidoId!)
        .single();
      if (pErr) throw pErr;

      const { data: itens, error: iErr } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedidoId!)
        .order('descricao_material');
      if (iErr) throw iErr;

      return { pedido, itens };
    },
  });
}

export interface UpdatePedidoPayload {
  pedido_id: string;
  cliente_id: string;
  fabricante_id: string;
  vendedor_id: string;
  obra_id?: string;
  data_pedido: string;
  prazo_resposta?: string;
  origem_lead?: string;
  endereco_entrega?: string;
  observacoes?: string;
  itens: {
    id?: string;
    descricao_material: string;
    referencia_fabricante?: string;
    quantidade: number;
    unidade?: string;
    preco_unitario: number;
  }[];
}

export function useUpdatePedidoCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdatePedidoPayload) => {
      // 1. Update pedido metadata
      const { error: pedidoErr } = await supabase
        .from('pedidos')
        .update({
          cliente_id: payload.cliente_id,
          fabricante_id: payload.fabricante_id,
          vendedor_id: payload.vendedor_id,
          obra_id: payload.obra_id || null,
          data_pedido: payload.data_pedido,
          prazo_resposta: payload.prazo_resposta || null,
          origem_lead: payload.origem_lead || null,
          endereco_entrega: payload.endereco_entrega || null,
          observacoes: payload.observacoes || null,
        })
        .eq('id', payload.pedido_id);
      if (pedidoErr) throw pedidoErr;

      // 2. Delete existing items and re-insert (simplest approach for full edit)
      const { error: delErr } = await supabase
        .from('itens_pedido')
        .delete()
        .eq('pedido_id', payload.pedido_id);
      if (delErr) throw delErr;

      // 3. Insert updated items
      if (payload.itens.length > 0) {
        const itensData = payload.itens.map(item => ({
          pedido_id: payload.pedido_id,
          descricao_material: item.descricao_material,
          referencia_fabricante: item.referencia_fabricante || null,
          quantidade: item.quantidade,
          unidade: item.unidade || null,
          preco_unitario: item.preco_unitario,
          preco_total: item.quantidade * item.preco_unitario,
        }));
        const { error: itensErr } = await supabase.from('itens_pedido').insert(itensData);
        if (itensErr) throw itensErr;
      }

      return { id: payload.pedido_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedido_completo'] });
    },
  });
}
