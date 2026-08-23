import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useRegistrarAtividade } from './use-historico-alteracoes';

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
      campos_extras?: Record<string, string>;
    }) => {
      // Get current usuario_id
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { data: created, error } = await supabase.from('clientes').insert({
        ...insertData,
        data_criacao: new Date().toISOString().slice(0, 10),
        usuario_id: vid,
        criado_por_usuario_id: vid,
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
      cliente_id?: string;
      nome_contato?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
      campos_extras?: Record<string, string>;
    }) => {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { error } = await supabase.from('contatos').insert({
        ...data,
        data_criacao: new Date().toISOString().slice(0, 10),
        usuario_id: vid,
        criado_por_usuario_id: vid,
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
      campos_extras?: Record<string, string>;
    }) => {
      const { error } = await supabase.from('clientes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'clientes',
          registroId: id,
          acao: 'DELETE',
          descricao: 'Excluiu um cliente',
        });
      }
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
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
      cliente_id?: string | null;
      campos_extras?: Record<string, string>;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
    },
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

// ⚠️ TEMPORÁRIO — remover junto com o DROP de `obras.status`.
//
// O "Status Inicial" da obra virou MARCADOR (`marcador_id`), mas a coluna `status` ainda
// existe no banco e ainda é NOT NULL: a migration de 23/08/2026 só ACRESCENTOU o marcador, e
// o DROP vem em arquivo próprio, depois que o site novo estiver publicado. Enquanto isso, o
// insert precisa mandar algum valor válido — sem ele o cadastro de obra falha em produção.
const STATUS_LEGADO_DA_OBRA = 'ativa';

export function useCreateObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      nome_obra: string;
      cliente_id: string;
      endereco_entrega?: string;
      marcador_id?: string | null;
      spe_cnpj?: string;
      campos_extras?: Record<string, string>;
    }) => {
      // Ver STATUS_LEGADO_DA_OBRA: a coluna ainda é obrigatória no banco. O valor vai PRIMEIRO
      // no objeto de propósito — quem ainda manda `status` explicitamente (o cadastro rápido de
      // obra dentro da ficha do cliente, que ainda tem os quatro rótulos fixos) continua
      // gravando a escolha da pessoa; forçar 'ativa' por cima trocaria o valor em silêncio.
      const { error } = await supabase
        .from('obras')
        .insert({ status: STATUS_LEGADO_DA_OBRA, ...data });
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
    // `campos_extras` entra aqui porque o create já aceitava e este não: dava para cadastrar
    // uma obra com campo personalizado preenchido e depois NÃO conseguir alterar aquele
    // valor — a edição descartava o campo em silêncio. `status` sai dos dois: quem grava a
    // etiqueta agora é `marcador_id`, e a edição nunca precisou reescrever a coluna legada.
    mutationFn: async ({ id, ...data }: {
      id: string;
      nome_obra?: string;
      cliente_id?: string;
      endereco_entrega?: string;
      marcador_id?: string | null;
      spe_cnpj?: string;
      campos_extras?: Record<string, string>;
    }) => {
      const { error } = await supabase.from('obras').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      // As duas chaves continuam obrigatórias: a ficha do cliente mostra as obras embutidas,
      // então invalidar só ['obras'] deixaria a tela do cliente com o dado velho.
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useDeleteObra() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
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
    onSuccess: (_data, id) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'obras',
          registroId: id,
          acao: 'DELETE',
          descricao: 'Excluiu uma obra',
        });
      }
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useDeleteObrasBulk() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
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
    onSuccess: (_data, ids) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'obras',
          acao: 'DELETE',
          descricao: `Excluiu ${ids.length} obra(s) em massa`,
        });
      }
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
    },
  });
}
