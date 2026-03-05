import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      empresa: string;
      tipo: string;
      cnpj?: string;
      email?: string;
      telefone?: string;
      endereco?: string;
    }) => {
      // Get current vendedor_id
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { error } = await supabase.from('clientes').insert({
        ...data,
        vendedor_id: vid,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      empresa?: string;
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
        vendedor_id: vid,
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
    mutationFn: async (data: { nome: string; email: string; telefone?: string; role?: string }) => {
      const { error } = await supabase.from('vendedores').insert({
        ...data,
        role: data.role || 'vendedor',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedores'] }),
  });
}

export function useCreateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { error } = await supabase.from('fabricantes').insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricantes'] }),
  });
}
