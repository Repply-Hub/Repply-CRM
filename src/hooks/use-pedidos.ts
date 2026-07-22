import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  prazo_resposta: string | null;
  campos_extras: Record<string, any> | null;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  obra: { id: string; nome_obra: string } | null;
}

export interface PedidosFilters {
  stages?: string[];
  vendedorIds?: string[];
  fabricanteIds?: string[];
  /** Escopa a busca a um único funil (pipeline). Sem isso, negócios de todos os funis da empresa aparecem juntos. */
  funilId?: string;
  dateFrom?: string;
  dateTo?: string;
  onlyAttention?: boolean;
  /** Busca por cliente/fabricante — hoje usada só na query de stats (RPC), não no fetch paginado da lista/kanban. */
  search?: string;
  /** Oculta negócios criados via importação em massa (import_hash preenchido). Não é enviado à
   *  query de stats (usePedidosStats) de propósito — os totais do cabeçalho continuam contando
   *  todos os negócios independente deste filtro visual. */
  hideImportados?: boolean;
}

async function resolveUsuarioIds(empresaId: string, vendedorIds?: string[]): Promise<string[]> {
  if (vendedorIds && vendedorIds.length > 0) return vendedorIds;
  const { data: companyUsers } = await supabase
    .from('usuarios')
    .select('id')
    .eq('empresa_id', empresaId);
  return companyUsers?.map(u => u.id) ?? [];
}

export function usePedidos(
  empresaId?: string,
  page = 0,
  pageSize = 50,
  stages?: string[],
  filters?: PedidosFilters,
  enabled = true,
) {
  const { vendedorIds, fabricanteIds, dateFrom, dateTo, onlyAttention, hideImportados, funilId } = filters ?? {};

  return useQuery({
    queryKey: ['pedidos', empresaId, page, pageSize, stages, vendedorIds, fabricanteIds, dateFrom, dateTo, onlyAttention, hideImportados, funilId],
    queryFn: async () => {
      let usuarioIds: string[] | null = null;

      if (empresaId) {
        usuarioIds = await resolveUsuarioIds(empresaId, vendedorIds);
        if (usuarioIds.length === 0) return { data: [], count: 0 };
      }

      let query = supabase
        .from('pedidos')
        .select(`
          id, status, valor_total, data_pedido, created_at, observacoes,
          cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta,
          cliente:clientes(id, empresa),
          fabricante:fabricantes(id, nome),
          vendedor:usuarios(id, nome, empresa_id),
          obra:obras(id, nome_obra)
        `, { count: 'exact' })
        // `created_at` tem MUITOS valores duplicados (imports em massa gravam o mesmo
        // timestamp em centenas de linhas) — sem um desempate único e estável, o Postgres
        // pode reordenar as linhas empatadas entre execuções, fazendo o range crescer
        // "embaralhando" o que já tinha sido buscado em vez de só acrescentar linhas novas.
        // `id` garante ordenação 100% determinística.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (usuarioIds) {
        query = query.in('usuario_id', usuarioIds);
      }

      if (stages && stages.length > 0) {
        query = query.in('status', stages);
      }

      if (funilId) {
        query = query.eq('funil_id', funilId);
      }

      if (fabricanteIds && fabricanteIds.length > 0) {
        query = query.in('fabricante_id', fabricanteIds);
      }

      if (dateFrom) query = query.gte('data_pedido', dateFrom);
      if (dateTo) query = query.lte('data_pedido', dateTo);

      if (onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff);
      }

      if (hideImportados) {
        query = query.is('import_hash', null);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as PedidoWithRelations[], count: count ?? 0 };
    },
    enabled: !!empresaId && enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    // Mantém os dados da página/lote (ou do "Ver mais") anterior visíveis enquanto busca
    // o próximo, para o board do Kanban/Lista não sumir/piscar a cada requisição.
    placeholderData: keepPreviousData,
  });
}

export function usePedidosStats(empresaId?: string, stages?: string[], filters?: PedidosFilters) {
  const { vendedorIds, fabricanteIds, dateFrom, dateTo, onlyAttention, search, funilId } = filters ?? {};

  return useQuery({
    // Reage a filtros e busca — NUNCA a page/pageSize/"Exibir"/"Ver mais", que não fazem
    // parte da queryKey aqui de propósito (o header precisa do total real, não do carregado).
    queryKey: ['pedidos_stats', empresaId, stages, vendedorIds, fabricanteIds, dateFrom, dateTo, onlyAttention, search, funilId],
    queryFn: async () => {
      let usuarioIds: string[] | null = null;

      if (empresaId) {
        usuarioIds = await resolveUsuarioIds(empresaId, vendedorIds);
        if (usuarioIds.length === 0) return { count: 0, valor: 0 };
      }

      const { data, error } = await supabase.rpc('pedidos_stats', {
        p_usuario_ids: usuarioIds,
        p_stages: stages && stages.length > 0 ? stages : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
        p_search: search?.trim() ? search.trim() : null,
        p_only_attention: !!onlyAttention,
        p_funil_id: funilId ?? null,
      });
      if (error) throw error;
      const row = data?.[0];
      return { count: Number(row?.total_count ?? 0), valor: Number(row?.total_valor ?? 0) };
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
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
      qc.invalidateQueries({ queryKey: ['pedidos_stats'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
      qc.invalidateQueries({ queryKey: ['vw_velocidade_por_fabricante'] });
    },
  });
}

const DELETE_BATCH_SIZE = 500;
const DELETE_BATCH_DELAY_MS = 200;

export function useBulkDeletePedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ids: string[] } | { empresaId: string; stages?: string[]; filters?: PedidosFilters }) => {
      if ('ids' in params) {
        const { ids } = params;
        if (ids.length === 0) return 0;

        if (ids.length <= DELETE_BATCH_SIZE) {
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', ids);
          if (error) throw error;
          return count ?? ids.length;
        }

        let deleted = 0;
        for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
          const batch = ids.slice(i, i + DELETE_BATCH_SIZE);
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', batch);
          if (error) throw error;
          deleted += count ?? batch.length;
          if (i + DELETE_BATCH_SIZE < ids.length) {
            await new Promise(resolve => setTimeout(resolve, DELETE_BATCH_DELAY_MS));
          }
        }
        return deleted;
      }

      const { empresaId, stages, filters } = params;
      const usuarioIds = await resolveUsuarioIds(empresaId, filters?.vendedorIds);
      if (usuarioIds.length === 0) return 0;

      let query = supabase.from('pedidos').delete({ count: 'exact' }).in('usuario_id', usuarioIds);
      if (stages && stages.length > 0) query = query.in('status', stages);
      if (filters?.funilId) query = query.eq('funil_id', filters.funilId);
      if (filters?.fabricanteIds && filters.fabricanteIds.length > 0) query = query.in('fabricante_id', filters.fabricanteIds);
      if (filters?.dateFrom) query = query.gte('data_pedido', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('data_pedido', filters.dateTo);
      if (filters?.onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff);
      }
      if (filters?.hideImportados) {
        query = query.is('import_hash', null);
      }

      const { error, count } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_stats'] });
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
