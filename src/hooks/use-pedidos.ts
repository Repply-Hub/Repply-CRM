import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useRegistrarAtividade } from './use-historico-alteracoes';

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
  pdf_url: string | null;
  campos_extras: Record<string, any> | null;
  marcador_id: string | null;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  obra: { id: string; nome_obra: string } | null;
  marcador: { id: string; nome: string; cor: string } | null;
}

export interface PedidosFilters {
  stages?: string[];
  vendedorIds?: string[];
  fabricanteIds?: string[];
  marcadorIds?: string[];
  /** Escopa a busca a um único funil (pipeline). Sem isso, negócios de todos os funis da empresa aparecem juntos. */
  funilId?: string;
  dateFrom?: string;
  dateTo?: string;
  onlyAttention?: boolean;
  /** Busca por cliente/fabricante — aplicada tanto na query de stats (RPC) quanto no fetch paginado da lista/kanban. */
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

// Defesa em profundidade para o caminho de ids explícitos (seleção manual do usuário) das
// mutações em massa: a RLS já barra UPDATE/DELETE fora da empresa, mas aqui tratamos qualquer
// id fora dela como IDOR — hard stop antes de tocar no banco, em vez de deixar a RLS
// silenciosamente afetar 0 linhas para esses ids (o que mascararia o problema no retorno da
// mutação, já que o `count` combinaria os ids válidos com os inválidos sem distinção).
async function assertIdsBelongToEmpresa(ids: string[], empresaId: string): Promise<void> {
  const usuarioIds = await resolveUsuarioIds(empresaId);
  if (usuarioIds.length === 0) {
    throw new Error('Não foi possível validar a empresa dos negócios selecionados.');
  }
  const { data, error } = await supabase
    .from('pedidos')
    .select('id')
    .in('id', ids)
    .in('usuario_id', usuarioIds);
  if (error) throw error;
  const validIds = new Set((data ?? []).map(row => row.id));
  if (ids.some(id => !validIds.has(id))) {
    throw new Error('Um ou mais negócios selecionados não pertencem à sua empresa.');
  }
}

// "Fechamento" (ganho) e "Perdido" são etapas finais — nunca contam como "parado" pro filtro
// Atenção, já que o alerta de dias na etapa também não aparece pra elas no front. Usado tanto no
// fetch paginado quanto nas mutações em massa "por filtro", que precisam do mesmo recorte.
const ETAPAS_FINAIS_ATENCAO = '(fechamento,perdido)';

interface SearchMatches {
  clienteIds: string[];
  fabricanteIds: string[];
  obraIds: string[];
}

// Busca por texto casa contra colunas de tabelas relacionadas (cliente/fabricante/obra), que o
// PostgREST não filtra via `.or()` sobre um `.select()` com embeds — por isso resolvemos os ids
// que batem com o termo em consultas enxutas (cada uma já restrita pela RLS da respectiva tabela)
// e então filtramos pedidos por esses ids. Compartilhado pelo fetch paginado e pelas mutações em
// massa "por filtro", que precisam do mesmo recorte que o usuário vê na tela.
async function resolveSearchMatches(trimmedSearch: string): Promise<SearchMatches> {
  const [{ data: clienteMatches }, { data: fabricanteMatches }, { data: obraMatches }] = await Promise.all([
    supabase.from('clientes').select('id').ilike('empresa', `%${trimmedSearch}%`),
    supabase.from('fabricantes').select('id').ilike('nome', `%${trimmedSearch}%`),
    supabase.from('obras').select('id').ilike('nome_obra', `%${trimmedSearch}%`),
  ]);
  return {
    clienteIds: (clienteMatches ?? []).map(c => c.id),
    fabricanteIds: (fabricanteMatches ?? []).map(f => f.id),
    obraIds: (obraMatches ?? []).map(o => o.id),
  };
}

const hasNoSearchMatches = (matches: SearchMatches) =>
  matches.clienteIds.length === 0 && matches.fabricanteIds.length === 0 && matches.obraIds.length === 0;

const buildSearchOrClause = (matches: SearchMatches): string => {
  const orParts: string[] = [];
  if (matches.clienteIds.length > 0) orParts.push(`cliente_id.in.(${matches.clienteIds.join(',')})`);
  if (matches.fabricanteIds.length > 0) orParts.push(`fabricante_id.in.(${matches.fabricanteIds.join(',')})`);
  if (matches.obraIds.length > 0) orParts.push(`obra_id.in.(${matches.obraIds.join(',')})`);
  return orParts.join(',');
};

export function usePedidos(
  empresaId?: string,
  page = 0,
  pageSize = 50,
  stages?: string[],
  filters?: PedidosFilters,
  enabled = true,
) {
  const { vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, onlyAttention, hideImportados, funilId, search } = filters ?? {};

  return useQuery({
    queryKey: ['pedidos', empresaId, page, pageSize, stages, vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, onlyAttention, hideImportados, funilId, search],
    queryFn: async () => {
      let usuarioIds: string[] | null = null;

      if (empresaId) {
        usuarioIds = await resolveUsuarioIds(empresaId, vendedorIds);
        if (usuarioIds.length === 0) return { data: [], count: 0 };
      }

      const trimmedSearch = search?.trim();
      const searchMatches = trimmedSearch ? await resolveSearchMatches(trimmedSearch) : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) {
        return { data: [], count: 0 };
      }

      let query = supabase
        .from('pedidos')
        .select(`
          id, status, valor_total, data_pedido, created_at, observacoes,
          cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
          cliente:clientes(id, empresa),
          fabricante:fabricantes(id, nome),
          vendedor:usuarios(id, nome, empresa_id),
          obra:obras(id, nome_obra),
          marcador:marcadores(id, nome, cor)
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

      if (marcadorIds && marcadorIds.length > 0) {
        query = query.in('marcador_id', marcadorIds);
      }

      if (dateFrom) query = query.gte('data_pedido', dateFrom);
      if (dateTo) query = query.lte('data_pedido', dateTo);

      if (onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
      }

      if (hideImportados) {
        query = query.is('import_hash', null);
      }

      if (searchMatches) {
        query = query.or(buildSearchOrClause(searchMatches));
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

// Negócios de um cliente específico (página de detalhes do cliente/empresa). Filtra direto no
// servidor por cliente_id em vez de reaproveitar usePedidos (que exige empresaId para rodar e,
// mesmo sem esse filtro, só traz os N pedidos mais recentes da empresa toda — negócios antigos
// de um cliente específico poderiam ficar de fora).
export function usePedidosPorCliente(clienteId?: string | null) {
  return useQuery({
    queryKey: ['pedidos_por_cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, status, valor_total, data_pedido, created_at, observacoes,
          cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
          cliente:clientes(id, empresa),
          fabricante:fabricantes(id, nome),
          vendedor:usuarios(id, nome, empresa_id),
          obra:obras(id, nome_obra),
          marcador:marcadores(id, nome, cor)
        `)
        .eq('cliente_id', clienteId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PedidoWithRelations[];
    },
  });
}

export interface PedidoOption {
  id: string;
  status: string;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
}

// Lista enxuta de negócios (só os campos usados pra rotular a opção) pra popular o seletor de
// "vincular a um negócio" no formulário de tarefas — não reaproveita usePedidos porque esse traz
// só os N pedidos mais recentes paginados, e aqui precisamos do universo pra busca.
export function usePedidosOptions(empresaId?: string) {
  return useQuery({
    queryKey: ['pedidos_options', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const usuarioIds = await resolveUsuarioIds(empresaId!);
      if (usuarioIds.length === 0) return [];
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, status, cliente:clientes(id, empresa), fabricante:fabricantes(id, nome)')
        .in('usuario_id', usuarioIds)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as PedidoOption[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePedidosStats(empresaId?: string, stages?: string[], filters?: PedidosFilters) {
  const { vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, onlyAttention, search, funilId, hideImportados } = filters ?? {};

  return useQuery({
    // Reage a filtros e busca — NUNCA a page/pageSize/"Exibir"/"Ver mais", que não fazem
    // parte da queryKey aqui de propósito (o header precisa do total real, não do carregado).
    queryKey: ['pedidos_stats', empresaId, stages, vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, onlyAttention, search, funilId, hideImportados],
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
        p_marcador_ids: marcadorIds && marcadorIds.length > 0 ? marcadorIds : null,
        p_hide_importados: !!hideImportados,
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
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
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
    onSuccess: (_data, { id, status }) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          registroId: id,
          acao: 'UPDATE',
          descricao: `Moveu o negócio para a etapa "${status}"`,
        });
      }
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['pedidos'] });

      const previousEntries = qc.getQueriesData<{ data: PedidoWithRelations[]; count: number }>({ queryKey: ['pedidos'] });

      let movedItem: PedidoWithRelations | undefined;
      for (const [, data] of previousEntries) {
        movedItem = data?.data.find(p => p.id === id);
        if (movedItem) break;
      }

      for (const [key, old] of previousEntries) {
        if (!old) continue;
        const stages = key[4] as string[] | undefined;
        const hasItem = old.data.some(p => p.id === id);

        if (stages && stages.length > 0) {
          const belongsToTarget = stages.includes(status);
          if (!belongsToTarget && hasItem) {
            qc.setQueryData(key, { data: old.data.filter(p => p.id !== id), count: Math.max(0, old.count - 1) });
          } else if (belongsToTarget && !hasItem && movedItem) {
            qc.setQueryData(key, { data: [{ ...movedItem, status }, ...old.data], count: old.count + 1 });
          }
          continue;
        }

        if (hasItem) {
          qc.setQueryData(key, { data: old.data.map(p => p.id === id ? { ...p, status } : p), count: old.count });
        }
      }

      return { previousEntries };
    },
    onError: (err, variables, context) => {
      context?.previousEntries?.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
      qc.invalidateQueries({ queryKey: ['pedidos_stats'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
      qc.invalidateQueries({ queryKey: ['dashboard_velocidade_fabricante'] });
    },
  });
}

const BULK_BATCH_SIZE = 500;
const BULK_BATCH_DELAY_MS = 200;

export type BulkPedidosTarget = { ids: string[] } | { empresaId: string; stages?: string[]; filters?: PedidosFilters; excludeIds?: string[] };

export function useBulkDeletePedidos() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (params: BulkPedidosTarget) => {
      if ('ids' in params) {
        const { ids } = params;
        if (ids.length === 0) return 0;

        const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
        if (!empresaId) throw new Error('Empresa não identificada.');
        await assertIdsBelongToEmpresa(ids, empresaId);

        if (ids.length <= BULK_BATCH_SIZE) {
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', ids);
          if (error) throw error;
          return count ?? ids.length;
        }

        let deleted = 0;
        for (let i = 0; i < ids.length; i += BULK_BATCH_SIZE) {
          const batch = ids.slice(i, i + BULK_BATCH_SIZE);
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', batch);
          if (error) throw error;
          deleted += count ?? batch.length;
          if (i + BULK_BATCH_SIZE < ids.length) {
            await new Promise(resolve => setTimeout(resolve, BULK_BATCH_DELAY_MS));
          }
        }
        return deleted;
      }

      const { empresaId, stages, filters, excludeIds } = params;
      const usuarioIds = await resolveUsuarioIds(empresaId, filters?.vendedorIds);
      if (usuarioIds.length === 0) return 0;

      // Precisa espelhar exatamente o mesmo recorte de `usePedidos`/`usePedidosStats` — senão a
      // exclusão "todos os filtrados" apaga mais do que o N mostrado/prometido no diálogo de
      // confirmação (ver ETAPAS_FINAIS_ATENCAO e resolveSearchMatches acima).
      const trimmedSearch = filters?.search?.trim();
      const searchMatches = trimmedSearch ? await resolveSearchMatches(trimmedSearch) : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) return 0;

      let query = supabase.from('pedidos').delete({ count: 'exact' }).in('usuario_id', usuarioIds);
      if (excludeIds && excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      if (stages && stages.length > 0) query = query.in('status', stages);
      if (filters?.funilId) query = query.eq('funil_id', filters.funilId);
      if (filters?.fabricanteIds && filters.fabricanteIds.length > 0) query = query.in('fabricante_id', filters.fabricanteIds);
      if (filters?.marcadorIds && filters.marcadorIds.length > 0) query = query.in('marcador_id', filters.marcadorIds);
      if (filters?.dateFrom) query = query.gte('data_pedido', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('data_pedido', filters.dateTo);
      if (filters?.onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
      }
      if (filters?.hideImportados) {
        query = query.is('import_hash', null);
      }
      if (searchMatches) {
        query = query.or(buildSearchOrClause(searchMatches));
      }

      const { error, count } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count, variables) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        const descricao = 'ids' in variables
          ? `Excluiu ${count} negócio(s) selecionado(s) manualmente`
          : `Excluiu ${count} negócio(s) em massa (exclusão por filtro)`;
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          acao: 'DELETE',
          descricao,
        });
      }
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
      qc.invalidateQueries({ queryKey: ['pedidos_stats'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
      qc.invalidateQueries({ queryKey: ['dashboard_velocidade_fabricante'] });
    },
  });
}

// Ambos os campos são opcionais — o chamador decide se altera a etapa, o marcador, ou os dois
// juntos numa mesma chamada (é responsabilidade do chamador garantir que ao menos um esteja presente).
export type BulkPedidosUpdates = { status?: string; marcador_id?: string | null };

// Aplica a mesma etapa (status) e/ou o mesmo marcador a vários negócios de uma vez, num único
// UPDATE — reaproveita o mesmo par de formatos de alvo do useBulkDeletePedidos (ids explícitos
// vs. "todos os filtrados" resolvido no servidor via os filtros já ativos na tela).
export function useBulkUpdatePedidos() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async ({ target, updates }: { target: BulkPedidosTarget; updates: BulkPedidosUpdates }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.marcador_id !== undefined) updateData.marcador_id = updates.marcador_id;
      if (updates.status === 'fechamento') {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localDate = new Date(now.getTime() - (offset * 60 * 1000));
        updateData.prazo_resposta = localDate.toISOString().split('T')[0];
      }

      if ('ids' in target) {
        const { ids } = target;
        if (ids.length === 0) return 0;

        const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
        if (!empresaId) throw new Error('Empresa não identificada.');
        await assertIdsBelongToEmpresa(ids, empresaId);

        if (ids.length <= BULK_BATCH_SIZE) {
          const { error, count } = await supabase.from('pedidos').update(updateData, { count: 'exact' }).in('id', ids);
          if (error) throw error;
          return count ?? ids.length;
        }

        let updated = 0;
        for (let i = 0; i < ids.length; i += BULK_BATCH_SIZE) {
          const batch = ids.slice(i, i + BULK_BATCH_SIZE);
          const { error, count } = await supabase.from('pedidos').update(updateData, { count: 'exact' }).in('id', batch);
          if (error) throw error;
          updated += count ?? batch.length;
          if (i + BULK_BATCH_SIZE < ids.length) {
            await new Promise(resolve => setTimeout(resolve, BULK_BATCH_DELAY_MS));
          }
        }
        return updated;
      }

      const { empresaId, stages, filters, excludeIds } = target;
      const usuarioIds = await resolveUsuarioIds(empresaId, filters?.vendedorIds);
      if (usuarioIds.length === 0) return 0;

      const trimmedSearch = filters?.search?.trim();
      const searchMatches = trimmedSearch ? await resolveSearchMatches(trimmedSearch) : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) return 0;

      let query = supabase.from('pedidos').update(updateData, { count: 'exact' }).in('usuario_id', usuarioIds);
      if (excludeIds && excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      if (stages && stages.length > 0) query = query.in('status', stages);
      if (filters?.funilId) query = query.eq('funil_id', filters.funilId);
      if (filters?.fabricanteIds && filters.fabricanteIds.length > 0) query = query.in('fabricante_id', filters.fabricanteIds);
      if (filters?.marcadorIds && filters.marcadorIds.length > 0) query = query.in('marcador_id', filters.marcadorIds);
      if (filters?.dateFrom) query = query.gte('data_pedido', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('data_pedido', filters.dateTo);
      if (filters?.onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
      }
      if (filters?.hideImportados) {
        query = query.is('import_hash', null);
      }
      if (searchMatches) {
        query = query.or(buildSearchOrClause(searchMatches));
      }

      const { error, count } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count, { target, updates }) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id && count > 0) {
        const campos = [
          updates.status !== undefined ? 'a etapa' : null,
          updates.marcador_id !== undefined ? 'o marcador' : null,
        ].filter(Boolean).join(' e ');
        const escopo = 'ids' in target ? 'selecionado(s) manualmente' : 'em massa (por filtro)';
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          acao: 'UPDATE',
          descricao: `Alterou ${campos} de ${count} negócio(s) ${escopo}`,
        });
      }
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
      qc.invalidateQueries({ queryKey: ['pedidos_stats'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
      qc.invalidateQueries({ queryKey: ['dashboard_velocidade_fabricante'] });
    },
  });
}

export interface PedidoHistoricoStatus {
  id: string;
  pedido_id: string;
  tipo: 'status' | 'campo';
  status_anterior: string | null;
  status_novo: string | null;
  campo: string | null;
  valor_anterior_txt: string | null;
  valor_novo_txt: string | null;
  usuario_id: string | null;
  usuario: { id: string; nome: string } | null;
  created_at: string;
}

// Histórico de movimentação do negócio no Kanban (uma linha por avanço/troca de
// etapa, incluindo a etapa inicial na criação). Alimentado só por trigger no
// banco (trg_pedidos_historico_status) — cobre drag-and-drop, edição manual e
// qualquer outra via de escrita, sem depender do front lembrar de instrumentar.
export function usePedidoHistoricoStatus(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido_historico_status', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos_historico_status')
        .select('*, usuario:usuarios(id, nome)')
        .eq('pedido_id', pedidoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoHistoricoStatus[];
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
