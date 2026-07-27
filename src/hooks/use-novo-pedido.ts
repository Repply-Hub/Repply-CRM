import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useObrasByCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['obras', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .eq('cliente_id', clienteId!)
        .order('nome_obra');
      if (error) throw error;
      return data;
    },
  });
}

export function useTabelaPrecos(fabricanteId: string | null) {
  return useQuery({
    queryKey: ['tabela_precos', fabricanteId],
    enabled: !!fabricanteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tabela_precos')
        .select('*')
        .eq('fabricante_id', fabricanteId!)
        .eq('vigente', true)
        .order('descricao_material');
      if (error) throw error;
      return data;
    },
  });
}

export function useMyVendedorId() {
  return useQuery({
    queryKey: ['my_vendedor_id'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_vendedor_id');
      if (error) throw error;
      return data as string;
    },
  });
}

export function useIsGestor() {
  return useQuery({
    queryKey: ['is_gestor'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_gestor');
      if (error) throw error;
      return data as boolean;
    },
  });
}

export interface NovoPedidoPayload {
  cliente_id: string;
  fabricante_id: string;
  usuario_id: string;
  funil_id: string;
  obra_id?: string;
  status?: string;
  data_pedido: string;
  prazo_resposta?: string;
  origem_lead?: string;
  endereco_entrega?: string;
  observacoes?: string;
  pdf_url?: string;
  valor_total?: number;
  itens: {
    descricao_material: string;
    referencia_fabricante?: string;
    quantidade: number;
    unidade?: string;
    preco_unitario: number;
  }[];
  proximo_contato?: string;
  campos_extras?: Record<string, string>;
}

export function useCreatePedidoCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: NovoPedidoPayload) => {
      // 1. Create pedido
      const { data: pedido, error: pedidoErr } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: payload.cliente_id,
          fabricante_id: payload.fabricante_id,
          usuario_id: payload.usuario_id,
          funil_id: payload.funil_id,
          obra_id: payload.obra_id || null,
          data_pedido: payload.data_pedido,
          status: payload.status || 'novo_lead',
          observacoes: payload.observacoes || null,
          pdf_url: payload.pdf_url || null,
          prazo_resposta: payload.prazo_resposta || null,
          origem_lead: payload.origem_lead || null,
          endereco_entrega: payload.endereco_entrega || null,
          valor_total: payload.valor_total || 0,
          campos_extras: payload.campos_extras || {},
        })
        .select('id')
        .single();
      if (pedidoErr) throw pedidoErr;

      // 2. Insert items
      const itensData = payload.itens.map(item => ({
        pedido_id: pedido.id,
        descricao_material: item.descricao_material,
        referencia_fabricante: item.referencia_fabricante || null,
        quantidade: item.quantidade,
        unidade: item.unidade || null,
        preco_unitario: item.preco_unitario,
      }));
      const { error: itensErr } = await supabase.from('itens_pedido').insert(itensData);
      if (itensErr) throw itensErr;

      // 3. Insert historico_contatos if proximo_contato set
      if (payload.proximo_contato) {
        await supabase.from('historico_contatos').insert({
          pedido_id: pedido.id,
          usuario_id: payload.usuario_id,
          tipo: 'automatico',
          descricao: 'Contato agendado na criação do negócio',
          proximo_contato_em: payload.proximo_contato,
        });
      }

      return pedido;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
    },
  });
}

export function useCreateFabricanteCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { data: created, error } = await supabase
        .from('fabricantes')
        .insert(data)
        .select('id')
        .single();
      if (error) throw error;
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
    },
  });
}
