import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insertData: {
      empresa?: string;
      razao_social?: string;
      tipo: string;
      cnpj?: string;
      email?: string;
      telefone?: string;
      endereco?: string;
    }) => {
      // Get current usuario_id
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { data: created, error } = await supabase.from('clientes').insert({
        ...insertData,
        data_criacao: new Date().toISOString().slice(0, 10),
        usuario_id: vid,
      }).select('id').single();
      if (error) throw error;
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useCreateContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      empresa?: string;
      nome_contato?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
    }) => {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { error } = await supabase.from('contatos').insert({
        ...data,
        data_criacao: new Date().toISOString().slice(0, 10),
        usuario_id: vid,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos'] }),
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      empresa?: string;
      razao_social?: string;
      tipo?: string;
      cnpj?: string;
      email?: string;
      telefone?: string;
      endereco?: string;
      nome_contato?: string;
    }) => {
      const { error } = await supabase.from('clientes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}
export function useDeleteContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contatos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos'] }),
  });
}
export function useUpdateContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      nome_contato?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
      empresa?: string;
    }) => {
      const { error } = await supabase.from('contatos').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos'] }),
  });
}
export function useCreatePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      cliente_id: string;
      fabricante_id: string;
      obra_id?: string;
      valor_total?: number;
      observacoes?: string;
    }) => {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { error } = await supabase.from('pedidos').insert({
        ...data,
        usuario_id: vid,
        status: 'novo_lead',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos'] }),
  });
}

export function useCreateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome?: string; email: string; telefone?: string; role?: string }) => {
      const { error } = await supabase.from('usuarios').insert({
        ...data,
        role: data.role || 'vendedor',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useCreateObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      nome_obra: string;
      cliente_id: string;
      endereco_entrega?: string;
      status?: string;
      spe_cnpj?: string;
    }) => {
      const { error } = await supabase.from('obras').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useUpdateObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      nome_obra?: string;
      cliente_id?: string;
      endereco_entrega?: string;
      status?: string;
      spe_cnpj?: string;
    }) => {
      const { error } = await supabase.from('obras').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useDeleteObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('Excluindo obra única:', id);
      const { data, error } = await supabase.from('obras').delete().eq('id', id).select();
      if (error) {
        console.error('Erro ao excluir obra única:', error);
        throw error;
      }
      console.log('Resultado exclusão única:', data);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useDeleteObrasBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      console.log('Iniciando exclusão em massa via RPC para IDs:', ids);
      if (!ids || ids.length === 0) {
        console.warn('Nenhum ID fornecido para exclusão');
        return;
      }
      
      // Usamos a função RPC para contornar problemas de performance/RLS em grandes volumes
      const { data, error } = await supabase.rpc('delete_obras_bulk', { 
        obra_ids: ids 
      });

      if (error) {
        console.error('Erro ao excluir obras em massa (RPC):', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useCreateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome?: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { error } = await supabase.from('fabricantes').insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricantes'] }),
  });
}
